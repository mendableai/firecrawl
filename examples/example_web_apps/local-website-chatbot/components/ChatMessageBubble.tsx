"use client";

import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { ChatWindowMessage } from '@/schema/ChatWindowMessage';

import { useState, type FormEvent } from "react";
import { Feedback } from 'langsmith';

export function ChatMessageBubble(props: {
  message: ChatWindowMessage;
  aiEmoji?: string;
  onRemovePressed?: () => void;
}) {
  const { role, content, runId } = props.message;

  const colorClassName =
    role === "human" ? "bg-sky-600" : "bg-slate-50 text-black";
  const alignmentClassName =
    role === "human" ? "ml-auto" : "mr-auto";
  const prefix = role === "human" ? "🧑" : props.aiEmoji;

  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [comment, setComment] = useState("");
  const [showCommentForm, setShowCommentForm] = useState(false);

  async function handleScoreButtonPress(e: React.MouseEvent<HTMLButtonElement, MouseEvent>, score: number) {
    e.preventDefault();
    setComment("");
    await sendFeedback(score);
  }

  async function handleCommentSubmission(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const score = typeof feedback?.score === "number" ? feedback.score : 0;
    await sendFeedback(score);
  }

  async function sendFeedback(score: number) {
    if (isLoading) {
      return;
    }

    setIsLoading(true);

    const response = await fetch("api/feedback", {
      method: feedback?.id ? "PUT" : "POST",
      body: JSON.stringify({
        id: feedback?.id,
        run_id: runId,
        score,
        comment,
      })
    });

    const json = await response.json();

    if (json.error) {
      toast(json.error, {
        theme: "dark"
      });
      return;
    } else if (feedback?.id && comment) {
      toast("Response recorded! Go to https://smith.langchain.com and check it out in under your run's \"Feedback\" pane.", {
        theme: "dark",
        autoClose: 3000,
      });
      setComment("");
      setShowCommentForm(false);
    } else {
      setShowCommentForm(true);
    }

    if (json.feedback) {
      setFeedback(json.feedback);
    }

    setIsLoading(false);
  }
  return (
    <div
      className={`${alignmentClassName} ${colorClassName} rounded px-4 py-2 max-w-[80%] mb-8 flex flex-col`}
    >
      <div className="flex hover:group group">
        <div className="mr-2">
          {prefix}
        </div>
        <div className="whitespace-pre-wrap">
          {/* TODO: Remove. Hacky fix, stop sequences don't seem to work with WebLLM yet. */}
          {content.trim().split("\nInstruct:")[0].split("\nInstruction:")[0]}
        </div>
        <div className="cursor-pointer opacity-0 hover:opacity-100 relative left-2 bottom-1" onMouseUp={props?.onRemovePressed}>
          ✖️
        </div>
      </div>
      <div className={`${!runId ? "hidden" : ""} ml-auto mt-2`}>
        <button className={`p-2 border text-3xl rounded hover:bg-green-400 ${feedback && feedback.score === 1 ? "bg-green-400" : ""}`} onMouseUp={(e) => handleScoreButtonPress(e, 1)}>
          👍
        </button>
        <button className={`p-2 border text-3xl rounded ml-4 hover:bg-red-400 ${feedback && feedback.score === 0 ? "bg-red-400" : ""}`} onMouseUp={(e) => handleScoreButtonPress(e, 0)}>
          👎
        </button>
      </div>
      <div className={`${(feedback && showCommentForm) ? "" : "hidden"} min-w-[480px]`}>
        <form onSubmit={handleCommentSubmission} className="relative">
          <input
              className="mr-8 p-4 rounded w-full border mt-2"
              value={comment}
              placeholder={feedback?.score === 1 ? "Anything else you'd like to add about this response?" : "What would the correct or preferred response have been?"}
              onChange={(e) => setComment(e.target.value)}
            />
          <div role="status" className={`${isLoading ? "" : "hidden"} flex justify-center absolute top-[24px] right-[16px]`}>
            <svg aria-hidden="true" className="w-6 h-6 text-slate-200 animate-spin dark:text-slate-200 fill-sky-800" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"/>
                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"/>
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        </form>
      </div>
    </div>
  );
}