# Local Chat With Websites

Welcome to the Local Web Chatbot! This is a direct fork of [Jacob Lee' fully local PDF chatbot](https://github.com/jacoblee93/fully-local-pdf-chatbot) replacing the chat with PDF functionality with chat with website support powered by [Firecrawl](https://www.firecrawl.dev/). It is a simple chatbot that allows you to ask questions about a website by embedding it and running queries against the vector store using a local LLM and embeddings.

## 🦙 Ollama

You can run more powerful, general models outside the browser using [Ollama's desktop app](https://ollama.ai). Users will need to download and set up then run the following commands to allow the site access to a locally running Mistral instance:

### Mac/Linux

```bash
$ OLLAMA_ORIGINS=https://webml-demo.vercel.app OLLAMA_HOST=127.0.0.1:11435 ollama serve
```

Then, in another terminal window:

```bash
$ OLLAMA_HOST=127.0.0.1:11435 ollama pull mistral
```

### Windows

```cmd
$ set OLLAMA_ORIGINS=https://webml-demo.vercel.app
set OLLAMA_HOST=127.0.0.1:11435
ollama serve
```

Then, in another terminal window:

```cmd
$ set OLLAMA_HOST=127.0.0.1:11435
ollama pull mistral
```

## 🔥 Firecrawl

Additionally, you will need a Firecrawl API key for website embedding. Signing up for [Firecrawl](https://www.firecrawl.dev/) is easy and you get 500 credits free. Enter your API key into the box below the URL in the embedding form.

## ⚡ Stack

It uses the following:

- [Voy](https://github.com/tantaraio/voy) as the vector store, fully WASM in the browser.
- [Ollama](https://ollama.ai/).
- [LangChain.js](https://js.langchain.com) to call the models, perform retrieval, and generally orchestrate all the pieces.
- [Transformers.js](https://huggingface.co/docs/transformers.js/index) to run open source [Nomic](https://www.nomic.ai/) embeddings in the browser.
  - For higher-quality embeddings, switch to `"nomic-ai/nomic-embed-text-v1"` in `app/worker.ts`.
- [Firecrawl](https://www.firecrawl.dev/) to scrape the webpages and deliver them in markdown format.

## 🔱 Forking

To run/deploy this yourself, simply fork this repo and install the required dependencies with `yarn`.

There are no required environment variables, but you can optionally set up [LangSmith tracing](https://smith.langchain.com/) while developing locally to help debug the prompts and the chain. Copy the `.env.example` file into a `.env.local` file:

```ini
# No environment variables required!

# LangSmith tracing from the web worker.
# WARNING: FOR DEVELOPMENT ONLY. DO NOT DEPLOY A LIVE VERSION WITH THESE
# VARIABLES SET AS YOU WILL LEAK YOUR LANGCHAIN API KEY.
NEXT_PUBLIC_LANGCHAIN_TRACING_V2="true"
NEXT_PUBLIC_LANGCHAIN_API_KEY=
NEXT_PUBLIC_LANGCHAIN_PROJECT=
```

Just make sure you don't set this in production, as your LangChain API key will be public on the frontend!

## 🙏 Thank you!

Huge thanks to Jacob Lee and the other contributors of the repo for making this happen! Be sure to give him a follow on Twitter [@Hacubu](https://x.com/hacubu)!
