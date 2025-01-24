import koffi, { KoffiFunction } from "koffi";
import { join } from "path";
import { stat } from "fs/promises";
import { platform } from "os";

// TODO: add a timeout to the Rust transformer
const rustExecutablePath = join(
  process.cwd(),
  "sharedLibs/html-transformer/target/release/",
  platform() === "darwin" ? "libhtml_transformer.dylib" : "libhtml_transformer.so"
);

class RustHTMLTransformer {
  private static instance: RustHTMLTransformer;
  private _extractLinks: KoffiFunction;
  private _extractMetadata: KoffiFunction;
  private _freeString: KoffiFunction;

  private constructor() {
    const lib = koffi.load(rustExecutablePath);
    this._freeString = lib.func("free_string", "void", ["string"]);
    const freedResultString = koffi.disposable("CString", "string", this._freeString);
    this._extractLinks = lib.func("extract_links", freedResultString, ["string"]);
    this._extractMetadata = lib.func("extract_metadata", freedResultString, ["string"]);
  }

  public static async getInstance(): Promise<RustHTMLTransformer> {
    if (!RustHTMLTransformer.instance) {
      try {
        await stat(rustExecutablePath);
      } catch (_) {
        throw Error("Rust html-transformer shared library not found");
      }
      RustHTMLTransformer.instance = new RustHTMLTransformer();
    }
    return RustHTMLTransformer.instance;
  }

  public async extractLinks(html: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      this._extractLinks.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(res));
        }
      });
    });
  }

  public async extractMetadata(html: string): Promise<any> {
    return new Promise<string[]>((resolve, reject) => {
      this._extractMetadata.async(html, (err: Error, res: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(JSON.parse(res));
        }
      });
    });
  }
}

export async function extractLinks(
  html: string | null | undefined,
): Promise<string[]> {
    if (!html) {
        return [];
    }

    const converter = await RustHTMLTransformer.getInstance();
    return await converter.extractLinks(html);
}

export async function extractMetadata(
    html: string | null | undefined,
): Promise<any> {
    if (!html) {
        return [];
    }

    const converter = await RustHTMLTransformer.getInstance();
    return await converter.extractMetadata(html);
}