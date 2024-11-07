import path from "path";
import os from "os";
import { createWriteStream, promises as fs } from "node:fs";
import { EngineError } from "../../error";
import { Writable } from "stream";
import { v4 as uuid } from "uuid";

export async function fetchFileToBuffer(url: string): Promise<{
    response: Response,
    buffer: Buffer
}> {
    const response = await fetch(url); // TODO: maybe we could use tlsclient for this? for proxying
    return {
        response,
        buffer: Buffer.from(await response.arrayBuffer()),
    };
}

export async function downloadFile(id: string, url: string): Promise<{
    response: Response
    tempFilePath: string
}> {
    const tempFilePath = path.join(os.tmpdir(), `tempFile-${id}--${uuid()}`);
    const tempFileWrite = createWriteStream(tempFilePath);

    const response = await fetch(url); // TODO: maybe we could use tlsclient for this? for proxying

    // This should never happen in the current state of JS (2024), but let's check anyways.
    if (response.body === null) {
        throw new EngineError("Response body was null", { cause: { response } });
    }

    response.body.pipeTo(Writable.toWeb(tempFileWrite));
    await new Promise((resolve, reject) => {
        tempFileWrite.on("finish", () => resolve(null));
        tempFileWrite.on("error", (error) => {
            reject(new EngineError("Failed to write to temp file", { cause: { error } }));
        });
    })

    return {
        response,
        tempFilePath,
    };
}
