use tracing::instrument;

use super::super::super::error::ScrapeURLError;
use super::{FireEngine, client};

impl FireEngine {
  #[instrument(
    name = "FireEngine::call_delete",
    skip(self),
    fields(response.status = tracing::field::Empty),
    err
  )]
  pub(super) async fn call_delete(&self, job_id: &str) -> Result<(), ScrapeURLError> {
    let res = client()?
      .delete(format!("{}/scrape/{}", self.url, job_id))
      .send()
      .await?;
    tracing::Span::current().record("response.status", res.status().as_u16());
    Ok(())
  }
}
