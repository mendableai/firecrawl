import axios from "axios";
import dotenv from "dotenv";
import { SearchResult } from "../../src/lib/entities";

dotenv.config();

export async function serper_search(q, num_results): Promise<SearchResult[]> {
  let data = JSON.stringify({
    q: q,
    num: num_results,
  });

  let config = {
    method: "POST",
    url: "https://google.serper.dev/search",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    data: data,
  };
  const response = await axios(config);
  if (response && response.data && Array.isArray(response.data.organic)) {
    return response.data.organic.map((a) => ({
      url: a.link,
      title: a.title,
      description: a.snippet,
    }));
  }else{
    return [];
  }
}
