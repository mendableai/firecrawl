//! TS `pipeline/validate.ts`: clean the codegen output down to the extract
//! function and check its shape before running it. TS uses the TypeScript
//! parser; this uses oxc, so syntax-error wording differs, and a source oxc
//! can't recover is checked for its syntax errors only.

use std::sync::LazyLock;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
  BindingProperty, Declaration, ExportDefaultDeclarationKind, Function, IdentifierName,
  IdentifierReference, LabelIdentifier, ObjectProperty, Program, PropertyKind, Statement,
  StaticMemberExpression,
};
use oxc_ast_visit::{Visit, walk};
use oxc_parser::{Parser, ParserReturn};
use oxc_span::{GetSpan, SourceType, Span};
use regex::Regex;

use super::js;

pub struct Issue {
  pub field: &'static str,
  pub reason: String,
  pub excerpt: String,
}

static FENCED: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(&format!(
    "```(?i-u:javascript|js|ts)?{}*((?s:.)*?)```",
    js::SPACE_CLASS
  ))
  .expect("static regex")
});
static FENCE_OPEN: LazyLock<Regex> = LazyLock::new(|| {
  Regex::new(&format!("^```(?i-u:javascript|js|ts)?{}*", js::SPACE_CLASS)).expect("static regex")
});
static FENCE_CLOSE: LazyLock<Regex> =
  LazyLock::new(|| Regex::new(&format!("```{}*$", js::SPACE_CLASS)).expect("static regex"));
static DECLARES_EXTRACT: LazyLock<Regex> = LazyLock::new(|| {
  let s = js::SPACE_CLASS;
  Regex::new(&format!(
    "(?m)^{s}*(?:export{s}+(?:default{s}+)?)?(?:async{s}+)?function{s}+extract\\b"
  ))
  .expect("static regex")
});
static EXPORT_PREFIX: LazyLock<Regex> = LazyLock::new(|| {
  let s = js::SPACE_CLASS;
  Regex::new(&format!("^(?i){s}*export{s}+(?:default{s}+)?")).expect("static regex")
});

fn strip_code_fences(raw: &str) -> String {
  let text = js::trim(raw);
  if let Some(body) = FENCED.captures(text).and_then(|x| x.get(1)) {
    return js::trim(body.as_str()).to_string();
  }
  let text = FENCE_OPEN.replace(text, "");
  let text = FENCE_CLOSE.replace(&text, "");
  js::trim(&text).to_string()
}

fn parse<'a>(allocator: &'a Allocator, code: &'a str) -> ParserReturn<'a> {
  Parser::new(allocator, code, SourceType::unambiguous().with_jsx(true)).parse()
}

/// A top-level statement as TS's checks see it: a function declaration
/// (exported or not), another allowed declaration, an empty statement, or code.
enum TopLevel<'b, 'a> {
  Function(&'b Function<'a>),
  Declaration,
  Empty,
  Code,
}

fn classify<'b, 'a>(statement: &'b Statement<'a>) -> TopLevel<'b, 'a> {
  match statement {
    Statement::FunctionDeclaration(f) => TopLevel::Function(f),
    Statement::VariableDeclaration(_) | Statement::ClassDeclaration(_) => TopLevel::Declaration,
    Statement::EmptyStatement(_) => TopLevel::Empty,
    Statement::ExportNamedDeclaration(export) => match &export.declaration {
      Some(Declaration::FunctionDeclaration(f)) => TopLevel::Function(f),
      Some(Declaration::VariableDeclaration(_) | Declaration::ClassDeclaration(_)) => {
        TopLevel::Declaration
      }
      _ => TopLevel::Code,
    },
    Statement::ExportDefaultDeclaration(export) => match &export.declaration {
      ExportDefaultDeclarationKind::FunctionDeclaration(f) => TopLevel::Function(f),
      ExportDefaultDeclarationKind::ClassDeclaration(_) => TopLevel::Declaration,
      _ => TopLevel::Code,
    },
    _ => TopLevel::Code,
  }
}

/// The last top-level `function extract` with a body, which wins at runtime.
fn find_extractor<'b, 'a>(program: &'b Program<'a>) -> Option<(usize, &'b Function<'a>)> {
  program
    .body
    .iter()
    .enumerate()
    .rev()
    .find_map(|(i, statement)| match classify(statement) {
      TopLevel::Function(f)
        if f.body.is_some() && f.id.as_ref().is_some_and(|id| id.name == "extract") =>
      {
        Some((i, f))
      }
      _ => None,
    })
}

fn text(code: &str, span: Span) -> &str {
  code
    .get(span.start as usize..span.end as usize)
    .unwrap_or_default()
}

/// TS `cleanGeneratedCode`: the extract function plus the declarations beside it.
pub fn clean_generated_code(raw: &str) -> Result<String, String> {
  let code = strip_code_fences(raw);
  let allocator = Allocator::default();
  let parsed = parse(&allocator, &code);
  let Some((index, _)) = find_extractor(&parsed.program) else {
    // TS's parser recovers from a syntax error and still finds extract; oxc
    // doesn't, so keep the source and let validation report the errors.
    if !parsed.errors.is_empty() && DECLARES_EXTRACT.is_match(&code) {
      return Ok(EXPORT_PREFIX.replace(&code, "").into_owned());
    }
    return Err("LLM did not return a function named extract".to_string());
  };
  let kept: Vec<String> = parsed
    .program
    .body
    .iter()
    .enumerate()
    .filter(|(i, statement)| {
      *i == index
        || matches!(
          classify(statement),
          TopLevel::Function(_) | TopLevel::Declaration
        )
    })
    // The sandbox runs this as a plain script, so a surviving `export` would throw.
    .map(|(_, statement)| {
      EXPORT_PREFIX
        .replace(text(&code, statement.span()), "")
        .into_owned()
    })
    .collect();
  Ok(js::trim(&kept.join("\n\n")).to_string())
}

fn excerpt(code: &str, span: Span) -> String {
  let text = js::collapse_space(text(code, span));
  match js::len(&text) > 180 {
    true => format!("{}...", js::prefix(&text, 177)),
    false => text,
  }
}

/// TS `validateGeneratedExtractor`.
pub fn validate_generated_extractor(code: &str) -> Vec<Issue> {
  let allocator = Allocator::default();
  let parsed = parse(&allocator, code);
  let mut issues: Vec<Issue> = parsed
    .errors
    .iter()
    .take(3)
    .map(|error| Issue {
      field: "source",
      reason: error.message.to_string(),
      excerpt: String::new(),
    })
    .collect();
  // A source oxc couldn't recover is reported by its syntax errors alone.
  if issues.is_empty() || find_extractor(&parsed.program).is_some() {
    validate_top_level_shape(code, &parsed.program, &mut issues);
  }
  let mut globals = ForbiddenGlobals {
    seen: Vec::new(),
    issues: &mut issues,
  };
  globals.visit_program(&parsed.program);
  issues
}

fn validate_top_level_shape(code: &str, program: &Program, issues: &mut Vec<Issue>) {
  let Some((index, extractor)) = find_extractor(program) else {
    issues.push(Issue {
      field: "source",
      reason: "missing function declaration named extract".to_string(),
      excerpt: String::new(),
    });
    return;
  };
  for (i, statement) in program.body.iter().enumerate() {
    if i != index && matches!(classify(statement), TopLevel::Code) {
      issues.push(Issue {
        field: "source",
        reason: "top-level code is not allowed; only function/class/const/let/var declarations may sit beside extract".to_string(),
        excerpt: excerpt(code, statement.span()),
      });
    }
  }
  let span = program.body[index].span();
  if !extractor.r#async {
    issues.push(Issue {
      field: "extract",
      reason: "extract must be async".to_string(),
      excerpt: excerpt(code, span),
    });
  }
  if extractor.params.items.len() + usize::from(extractor.params.rest.is_some()) != 2 {
    issues.push(Issue {
      field: "extract",
      reason: "extract must accept exactly two parameters: doc and askLlm".to_string(),
      excerpt: excerpt(code, span),
    });
  }
}

const FORBIDDEN_GLOBALS: &[&str] = &["fetch", "XMLHttpRequest"];

/// References to globals the sandbox lacks. Like TS, every identifier counts
/// except a member access name, a `key: value` property name and a renamed
/// destructuring key.
struct ForbiddenGlobals<'i> {
  seen: Vec<&'static str>,
  issues: &'i mut Vec<Issue>,
}

impl ForbiddenGlobals<'_> {
  fn check(&mut self, name: &str) {
    let Some(global) = FORBIDDEN_GLOBALS.iter().find(|x| **x == name) else {
      return;
    };
    if self.seen.contains(global) {
      return;
    }
    self.seen.push(global);
    self.issues.push(Issue {
      field: "source",
      reason: format!(
        "references forbidden global '{global}' (not available in the sandbox; will throw at runtime)"
      ),
      excerpt: global.to_string(),
    });
  }
}

impl<'a> Visit<'a> for ForbiddenGlobals<'_> {
  fn visit_identifier_name(&mut self, it: &IdentifierName<'a>) {
    self.check(&it.name);
  }

  fn visit_identifier_reference(&mut self, it: &IdentifierReference<'a>) {
    self.check(&it.name);
  }

  fn visit_binding_identifier(&mut self, it: &oxc_ast::ast::BindingIdentifier<'a>) {
    self.check(&it.name);
  }

  fn visit_label_identifier(&mut self, it: &LabelIdentifier<'a>) {
    self.check(&it.name);
  }

  fn visit_static_member_expression(&mut self, it: &StaticMemberExpression<'a>) {
    self.visit_expression(&it.object);
  }

  fn visit_object_property(&mut self, it: &ObjectProperty<'a>) {
    match it.kind == PropertyKind::Init && !it.method && !it.shorthand && !it.computed {
      true => self.visit_expression(&it.value),
      false => walk::walk_object_property(self, it),
    }
  }

  fn visit_binding_property(&mut self, it: &BindingProperty<'a>) {
    match !it.shorthand && !it.computed {
      true => self.visit_binding_pattern(&it.value),
      false => walk::walk_binding_property(self, it),
    }
  }
}

/// TS `formatGeneratedCodeIssues`.
pub fn format_issues(issues: &[Issue]) -> String {
  issues
    .iter()
    .take(16)
    .map(|issue| match issue.excerpt.is_empty() {
      true => format!("- {}: {}", issue.field, issue.reason),
      false => format!("- {}: {}; {}", issue.field, issue.reason, issue.excerpt),
    })
    .collect::<Vec<_>>()
    .join("\n")
}
