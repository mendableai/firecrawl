export async function useGithubStars() {
  const res = await fetch("https://api.github.com/repos/mendableai/firecrawl");
  const data = await res.json();
  return data.stargazers_count;
}
