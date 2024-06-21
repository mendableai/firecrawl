"use client";

import { Id, ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { useRef, useState, useEffect } from "react";
import type { FormEvent } from "react";

import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { ChatWindowMessage } from "@/schema/ChatWindowMessage";

export function ChatWindow(props: { placeholder?: string }) {
  const { placeholder } = props;
  const [messages, setMessages] = useState<ChatWindowMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [selectedURL, setSelectedURL] = useState<string | null>(null);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState("");
  const [readyToChat, setReadyToChat] = useState(false);
  const initProgressToastId = useRef<Id | null>(null);
  const titleText = "Local Chat With Websites";
  const emoji = "🔥";

  const worker = useRef<Worker | null>(null);

  async function queryStore(messages: ChatWindowMessage[]) {
    if (!worker.current) {
      throw new Error("Worker is not ready.");
    }
    return new ReadableStream({
      start(controller) {
        if (!worker.current) {
          controller.close();
          return;
        }
        const ollamaConfig = {
          baseUrl: "http://localhost:11435",
          temperature: 0.3,
          model: "mistral",
        };
        const payload: Record<string, any> = {
          messages,
          modelProvider: "ollama",
          modelConfig: ollamaConfig,
        };
        if (
          process.env.NEXT_PUBLIC_LANGCHAIN_TRACING_V2 === "true" &&
          process.env.NEXT_PUBLIC_LANGCHAIN_API_KEY !== undefined
        ) {
          console.warn(
            "[WARNING]: You have set your LangChain API key publicly. This should only be done in local devlopment - remember to remove it before deploying!",
          );
          payload.DEV_LANGCHAIN_TRACING = {
            LANGCHAIN_TRACING_V2: "true",
            LANGCHAIN_API_KEY: process.env.NEXT_PUBLIC_LANGCHAIN_API_KEY,
            LANGCHAIN_PROJECT: process.env.NEXT_PUBLIC_LANGCHAIN_PROJECT,
          };
        }
        worker.current?.postMessage(payload);
        const onMessageReceived = async (e: any) => {
          switch (e.data.type) {
            case "log":
              console.log(e.data);
              break;
            case "init_progress":
              if (initProgressToastId.current === null) {
                initProgressToastId.current = toast(
                  "Loading model weights... This may take a while",
                  {
                    progress: e.data.data.progress || 0.01,
                    theme: "dark",
                  },
                );
              } else {
                if (e.data.data.progress === 1) {
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                toast.update(initProgressToastId.current, {
                  progress: e.data.data.progress || 0.01,
                });
              }
              break;
            case "chunk":
              controller.enqueue(e.data.data);
              break;
            case "error":
              worker.current?.removeEventListener("message", onMessageReceived);
              console.log(e.data.error);
              const error = new Error(e.data.error);
              controller.error(error);
              break;
            case "complete":
              worker.current?.removeEventListener("message", onMessageReceived);
              controller.close();
              break;
          }
        };
        worker.current?.addEventListener("message", onMessageReceived);
      },
    });
  }

  async function sendMessage(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (isLoading || !input) {
      return;
    }

    const initialInput = input;
    const initialMessages = [...messages];
    const newMessages = [
      ...initialMessages,
      { role: "human" as const, content: input },
    ];

    setMessages(newMessages);
    setIsLoading(true);
    setInput("");

    try {
      const stream = await queryStore(newMessages);
      const reader = stream.getReader();

      let chunk = await reader.read();

      const aiResponseMessage: ChatWindowMessage = {
        content: "",
        role: "ai" as const,
      };

      setMessages([...newMessages, aiResponseMessage]);

      while (!chunk.done) {
        aiResponseMessage.content = aiResponseMessage.content + chunk.value;
        setMessages([...newMessages, aiResponseMessage]);
        chunk = await reader.read();
      }

      setIsLoading(false);
    } catch (e: any) {
      setMessages(initialMessages);
      setIsLoading(false);
      setInput(initialInput);
      toast(`There was an issue with querying your website: ${e.message}`, {
        theme: "dark",
      });
    }
  }

  // We use the `useEffect` hook to set up the worker as soon as the `App` component is mounted.
  useEffect(() => {
    if (!worker.current) {
      // Create the worker if it does not yet exist.
      worker.current = new Worker(
        new URL("../app/worker.ts", import.meta.url),
        {
          type: "module",
        },
      );
      setIsLoading(false);
    }
  }, []);

  async function embedWebsite(e: FormEvent<HTMLFormElement>) {
    console.log(e);
    console.log(selectedURL);
    console.log(firecrawlApiKey);
    e.preventDefault();
    // const reader = new FileReader();
    if (selectedURL === null) {
      toast(`You must enter a URL to embed.`, {
        theme: "dark",
      });
      return;
    }
    setIsLoading(true);
    worker.current?.postMessage({
      url: selectedURL,
      firecrawlApiKey: firecrawlApiKey,
    });
    const onMessageReceived = (e: any) => {
      switch (e.data.type) {
        case "log":
          console.log(e.data);
          break;
        case "error":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          console.log(e.data.error);
          toast(`There was an issue embedding your website: ${e.data.error}`, {
            theme: "dark",
          });
          break;
        case "complete":
          worker.current?.removeEventListener("message", onMessageReceived);
          setIsLoading(false);
          setReadyToChat(true);
          toast(
            `Embedding successful! Now try asking a question about your website.`,
            {
              theme: "dark",
            },
          );
          break;
      }
    };
    worker.current?.addEventListener("message", onMessageReceived);
  }

  const chooseDataComponent = (
    <>
      <div className="p-4 md:p-8 rounded bg-[#25252d] w-full max-h-[85%] overflow-hidden flex flex-col">
        <h1 className="text-3xl md:text-4xl mb-2 ml-auto mr-auto">
          {emoji} Local Chat With Websites {emoji}
        </h1>
        <ul>
          <li className="text-l">
            🏡
            <span className="ml-2">
              Welcome to the Local Web Chatbot!
              <br></br>
              <br></br>
              This is a direct fork of{" "}
              <a href="https://github.com/jacoblee93/fully-local-pdf-chatbot">
                Jacob Lee&apos;s fully local PDF chatbot
              </a>{" "}
              replacing the chat with PDF functionality with website support. It
              is a simple chatbot that allows you to ask questions about a
              website by embedding it and running queries against the vector
              store using a local LLM and embeddings.
            </span>
          </li>
          <li>
            ⚙️
            <span className="ml-2">
              The default LLM is Mistral-7B run locally by Ollama. You&apos;ll
              need to install{" "}
              <a target="_blank" href="https://ollama.ai">
                the Ollama desktop app
              </a>{" "}
              and run the following commands to give this site access to the
              locally running model:
              <br />
              <pre className="inline-flex px-2 py-1 my-2 rounded">
                $ OLLAMA_ORIGINS=https://webml-demo.vercel.app
                OLLAMA_HOST=127.0.0.1:11435 ollama serve
              </pre>
              <br />
              Then, in another window:
              <br />
              <pre className="inline-flex px-2 py-1 my-2 rounded">
                $ OLLAMA_HOST=127.0.0.1:11435 ollama pull mistral
              </pre>
              <br />
              Additionally, you will need a Firecrawl API key for website
              embedding. Signing up at{" "}
              <a target="_blank" href="https://firecrawl.dev">
                firecrawl.dev
              </a>{" "}
              is easy and you get 500 credits free. Enter your API key into the
              box below the URL in the embedding form.
            </span>
          </li>

          <li className="text-l">
            🐙
            <span className="ml-2">
              Both this template and Jacob Lee&apos;s template are open source -
              you can see the source code and deploy your own version{" "}
              <a
                href="https://github.com/ericciarla/local-web-chatbot"
                target="_blank"
              >
                from the GitHub repo
              </a>
              or Jacob&apos;s{" "}
              <a href="https://github.com/jacoblee93/fully-local-pdf-chatbot">
                original GitHub repo
              </a>
              !
            </span>
          </li>
          <li className="text-l">
            👇
            <span className="ml-2">
              Try embedding a website below, then asking questions! You can even
              turn off your WiFi after the website is scraped.
            </span>
          </li>
        </ul>
      </div>

      <form
        onSubmit={embedWebsite}
        className="mt-4 flex flex-col justify-between items-center w-full"
      >
        <input
          id="url_input"
          type="text"
          placeholder="Enter a URL to scrape"
          className="text-black mb-2 w-[300px] px-4 py-2 rounded-lg"
          onChange={(e) => setSelectedURL(e.target.value)}
        ></input>
        <input
          id="api_key_input"
          type="text"
          placeholder="Enter your Firecrawl API Key"
          className="text-black mb-2 w-[300px] px-4 py-2 rounded-lg"
          onChange={(e) => setFirecrawlApiKey(e.target.value)}
        ></input>
        <button
          type="submit"
          className="shrink-0 px-4 py-4 bg-sky-600 rounded w-42"
        >
          <div
            role="status"
            className={`${isLoading ? "" : "hidden"} flex justify-center`}
          >
            <svg
              aria-hidden="true"
              className="w-6 h-6 text-white animate-spin dark:text-white fill-sky-800"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
          <span className={isLoading ? "hidden" : ""}>Embed Website</span>
        </button>
      </form>
    </>
  );

  const chatInterfaceComponent = (
    <>
      <div className="flex flex-col-reverse w-full mb-4 overflow-auto grow">
        {messages.length > 0
          ? [...messages].reverse().map((m, i) => (
              <ChatMessageBubble
                key={i}
                message={m}
                aiEmoji={emoji}
                onRemovePressed={() =>
                  setMessages((previousMessages) => {
                    const displayOrderedMessages = previousMessages.reverse();
                    return [
                      ...displayOrderedMessages.slice(0, i),
                      ...displayOrderedMessages.slice(i + 1),
                    ].reverse();
                  })
                }
              ></ChatMessageBubble>
            ))
          : ""}
      </div>

      <form onSubmit={sendMessage} className="flex w-full flex-col">
        <div className="flex w-full mt-4">
          <input
            className="grow mr-8 p-4 rounded"
            value={input}
            placeholder={placeholder ?? "What's it like to be a pirate?"}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            className="shrink-0 px-8 py-4 bg-sky-600 rounded w-28"
          >
            <div
              role="status"
              className={`${isLoading ? "" : "hidden"} flex justify-center`}
            >
              <svg
                aria-hidden="true"
                className="w-6 h-6 text-white animate-spin dark:text-white fill-sky-800"
                viewBox="0 0 100 101"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                  fill="currentColor"
                />
                <path
                  d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                  fill="currentFill"
                />
              </svg>
              <span className="sr-only">Loading...</span>
            </div>
            <span className={isLoading ? "hidden" : ""}>Send</span>
          </button>
        </div>
      </form>
    </>
  );

  return (
    <div
      className={`flex flex-col items-center p-4 md:p-8 rounded grow overflow-hidden ${
        readyToChat ? "border" : ""
      }`}
    >
      <h2 className={`${readyToChat ? "" : "hidden"} text-2xl`}>
        {emoji} {titleText}
      </h2>
      {readyToChat ? chatInterfaceComponent : chooseDataComponent}
      <ToastContainer />
    </div>
  );
}
