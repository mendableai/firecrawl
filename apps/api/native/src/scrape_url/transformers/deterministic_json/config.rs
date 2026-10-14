//! TS `deterministicJson/config.ts`.

use std::sync::LazyLock;

/// Like zod's `.default()`: only an unset variable takes the default.
fn env_or(name: &str, default: &str) -> String {
  std::env::var(name).unwrap_or_else(|_| default.to_string())
}

pub static CODEGEN_MODEL: LazyLock<String> =
  LazyLock::new(|| env_or("EXTRACT_CODEGEN_MODEL", "gemini-3.1-flash-lite"));
pub static ANCHOR_MODEL: LazyLock<String> =
  LazyLock::new(|| env_or("EXTRACT_ANCHOR_MODEL", "openai/gpt-oss-120b"));
pub static LIGHT_MODEL: LazyLock<String> =
  LazyLock::new(|| env_or("EXTRACT_LIGHT_MODEL", "openai/gpt-oss-20b"));
pub static CODE_SANDBOX_URL: LazyLock<String> =
  LazyLock::new(|| env_or("CODE_SANDBOX_URL", "ws://code-sandbox:3001"));

/// Bump to invalidate every cached extractor at once.
pub const CACHE_VERSION: u32 = 1;

pub const MARKDOWN_BUDGET: usize = 50_000;
pub const HTML_BUDGET: usize = 40_000;

pub const ANCHOR_PER_BLOCK_BUDGET: usize = 8_000;
pub const ANCHOR_TOTAL_BUDGET: usize = 60_000;
pub const ANCHOR_MAX_BLOCKS: usize = 16;
pub const ANCHOR_MAX_PARENTS: usize = 8;

pub const CODEGEN_MAX_TOKENS: u32 = 16_384;
pub const ANCHOR_PICKER_MAX_TOKENS: u32 = 2_000;
pub const ASK_LLM_MAX_TOKENS: u32 = 2_048;

pub const ASK_LLM_MAX_CALLS: usize = 50;

pub const SANDBOX_TIMEOUT_MS: u64 = 120_000;
