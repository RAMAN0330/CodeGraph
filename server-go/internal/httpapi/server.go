package httpapi

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"time"

	"codeflow/server/internal/config"
)

type API struct {
	cfg      config.Config
	client   *http.Client
	analysis http.Handler
	legacy   http.Handler
}

func New(cfg config.Config) http.Handler {
	target, _ := url.Parse(cfg.FastAPIURL)
	legacyTarget, _ := url.Parse(cfg.LegacyAPIURL)
	api := &API{cfg: cfg, client: &http.Client{Timeout: 20 * time.Second}, analysis: newReverseProxy(target), legacy: newReverseProxy(legacyTarget)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", api.live)
	mux.HandleFunc("GET /health/ready", api.ready)
	// Analysis jobs clone arbitrary repositories, so they go through the
	// legacy API, which enforces the session, validates the GitHub URL and
	// checks repository access before proxying on to the analysis service.
	mux.Handle("POST /api/analyze", api.legacy)
	mux.Handle("GET /api/tasks/{taskId}", api.legacy)
	mux.Handle("/auth/", api.legacy)
	mux.Handle("/api/db/", api.legacy)
	mux.Handle("/api/architecture/", api.legacy)
	mux.Handle("/api/analysis/", api.legacy)
	mux.Handle("/api/projects", api.legacy)
	mux.Handle("/api/projects/", api.legacy)
	mux.Handle("/api/workspaces", api.legacy)
	mux.Handle("/api/workspaces/", api.legacy)
	// Repo tree/file fetches are cached in Postgres by the legacy API
	// (repo_tree_cache / repo_file_cache) rather than in-memory here, so the
	// cache is shared and durable across all gateway replicas.
	mux.Handle("POST /api/github/repo", validateRepositoryBody(api.legacy))
	mux.Handle("POST /api/github/file", validateRepositoryBody(api.legacy))
	mux.Handle("GET /api/github/repos", api.legacy)
	mux.Handle("GET /api/github/access/{owner}/{repo}", api.legacy)
	mux.Handle("GET /api/github/token", api.legacy)
	return chain(http.MaxBytesHandler(mux, cfg.MaxBodyBytes), recoverer, requestLog, concurrencyLimit(cfg.MaxConcurrentRequests), rateLimit(cfg.RateLimitPerSecond, cfg.TrustProxyHeader), cors(cfg.ClientOrigin))
}

var repositorySegment = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,100}$`)

// validateRepositoryBody rejects malformed owner/repo pairs at the edge, then
// replays the (size-bounded) body to the upstream handler.
func validateRepositoryBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		var payload struct {
			Owner string `json:"owner"`
			Repo  string `json:"repo"`
		}
		if json.Unmarshal(body, &payload) != nil || !validSegment(payload.Owner) || !validSegment(payload.Repo) {
			writeError(w, http.StatusUnprocessableEntity, "owner and repo must be valid GitHub names")
			return
		}
		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		next.ServeHTTP(w, r)
	})
}

func validSegment(value string) bool {
	return repositorySegment.MatchString(value) && value != "." && value != ".."
}

func newReverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ModifyResponse = func(response *http.Response) error {
		response.Header.Del("Access-Control-Allow-Origin")
		response.Header.Del("Access-Control-Allow-Credentials")
		return nil
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		writeError(w, http.StatusBadGateway, "upstream unavailable")
	}
	return proxy
}

func (a *API) live(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}
func (a *API) ready(w http.ResponseWriter, r *http.Request) {
	dependencies := map[string]string{"analysis": a.cfg.FastAPIURL + "/", "legacy_api": a.cfg.LegacyAPIURL + "/auth/me"}
	for name, endpoint := range dependencies {
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, endpoint, nil)
		response, err := a.client.Do(req)
		if err != nil || response.StatusCode >= 500 {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready", "dependency": name})
			return
		}
		response.Body.Close()
	}
	writeJSON(w, 200, map[string]string{"status": "ready"})
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
