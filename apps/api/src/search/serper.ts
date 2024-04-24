import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

export async function serper_search(q, num_results) : Promise<string[]> {
  let data = JSON.stringify({
    q: q,
    "num": num_results,
    
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
    return response.data.organic.map((a) => a.link);
  } else {
    return [];
  }
}
