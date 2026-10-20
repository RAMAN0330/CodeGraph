//! Django model introspection: models, their fields and foreign-key relationships.

use serde::Serialize;
use tree_sitter::{Node, Tree};

const RELATION_FIELDS: [&str; 3] = ["ForeignKey", "OneToOneField", "ManyToManyField"];

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Field {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Model {
    pub name: String,
    pub file: String,
    pub fields: Vec<Field>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Relationship {
    pub source: String,
    pub target: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub field: String,
}

pub fn is_models_file(rel_path: &str) -> bool {
    rel_path == "models.py"
        || rel_path.ends_with("/models.py")
        || rel_path.starts_with("models/")
        || rel_path.contains("/models/")
}

pub fn introspect(tree: &Tree, src: &[u8], rel_path: &str) -> (Vec<Model>, Vec<Relationship>) {
    let mut models = Vec::new();
    let mut relationships = Vec::new();
    let mut stack = vec![tree.root_node()];
    while let Some(node) = stack.pop() {
        if node.kind() == "class_definition" {
            if let Some(model) = model(node, src, rel_path, &mut relationships) {
                models.push(model);
            }
        }
        let mut cursor = node.walk();
        stack.extend(node.children(&mut cursor));
    }
    models.sort_by_key(|m| m.name.clone());
    (models, relationships)
}

fn text<'a>(node: Node, src: &'a [u8]) -> &'a str {
    node.utf8_text(src).unwrap_or("")
}

/// A class is a model when it subclasses `*Model` or declares at least one Django field;
/// that skips inner `Meta` classes and plain helpers living in models.py.
fn model(
    class: Node,
    src: &[u8],
    rel_path: &str,
    relationships: &mut Vec<Relationship>,
) -> Option<Model> {
    let name = text(class.child_by_field_name("name")?, src).to_string();
    let subclasses_model = class
        .child_by_field_name("superclasses")
        .is_some_and(|bases| {
            text(bases, src)
                .split([',', '(', ')'])
                .any(|b| b.trim().ends_with("Model"))
        });
    let body = class.child_by_field_name("body")?;
    let mut fields = Vec::new();
    let mut cursor = body.walk();
    for statement in body.children(&mut cursor) {
        let Some(assignment) = statement
            .named_child(0)
            .filter(|n| statement.kind() == "expression_statement" && n.kind() == "assignment")
        else {
            continue;
        };
        let (Some(left), Some(call)) = (
            assignment.child_by_field_name("left"),
            assignment.child_by_field_name("right"),
        ) else {
            continue;
        };
        if left.kind() != "identifier" || call.kind() != "call" {
            continue;
        }
        let Some(function) = call.child_by_field_name("function") else {
            continue;
        };
        let field_type = match function.kind() {
            "attribute" => function
                .child_by_field_name("attribute")
                .map(|a| text(a, src))
                .unwrap_or(""),
            "identifier" => text(function, src),
            _ => continue,
        };
        if !(field_type.contains("Field") || RELATION_FIELDS.contains(&field_type)) {
            continue;
        }
        let field_name = text(left, src).to_string();
        if RELATION_FIELDS.contains(&field_type) {
            relationships.push(Relationship {
                source: name.clone(),
                target: call
                    .child_by_field_name("arguments")
                    .map(|args| relation_target(args, src))
                    .unwrap_or_default(),
                kind: field_type.to_string(),
                field: field_name.clone(),
            });
        }
        fields.push(Field {
            name: field_name,
            kind: field_type.to_string(),
        });
    }
    (subclasses_model || !fields.is_empty()).then(|| Model {
        name,
        file: rel_path.to_string(),
        fields,
    })
}

/// The related model: the first positional argument, or `to=`.
fn relation_target(args: Node, src: &[u8]) -> String {
    let mut cursor = args.walk();
    let mut keyword_target = None;
    for arg in args.named_children(&mut cursor) {
        match arg.kind() {
            "keyword_argument" => {
                if arg
                    .child_by_field_name("name")
                    .is_some_and(|n| text(n, src) == "to")
                {
                    keyword_target = arg.child_by_field_name("value").map(|v| value_text(v, src));
                }
            }
            "comment" => {}
            _ => return value_text(arg, src),
        }
    }
    keyword_target.unwrap_or_default()
}

fn value_text(node: Node, src: &[u8]) -> String {
    if node.kind() == "string" {
        let mut cursor = node.walk();
        let content = node
            .named_children(&mut cursor)
            .find(|c| c.kind() == "string_content")
            .map(|c| text(c, src));
        return content.unwrap_or("").to_string();
    }
    text(node, src).to_string()
}
