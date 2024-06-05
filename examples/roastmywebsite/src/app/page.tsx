// pages/index.tsx
import MainComponent from "@/components/main";
import { useGithubStars } from "./hooks/useGithubStars";
import GithubButton from "@/components/github-button";

export default async function Home() {
  const githubStars = await useGithubStars();
  return (
    <div className="relative">
      <div className="hidden md:flex z-10 absolute top-4 right-4 p-4">
        <GithubButton githubStars={githubStars} />
      </div>
      <MainComponent />
    </div>
  );
}
