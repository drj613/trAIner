import { readImportFile, MAX_ROUTINE_FILE_BYTES } from "./fileSource";

function fileWith(text: string, size = Buffer.byteLength(text), name = "routine.json") {
  const file = { name, size, text: jest.fn().mockResolvedValue(text) } as unknown as File;
  return file;
}

describe("readImportFile", () => {
  it("accepts a file exactly at the size limit and reads its content", async () => {
    const file = fileWith("{}", MAX_ROUTINE_FILE_BYTES);

    await expect(readImportFile(file)).resolves.toEqual({ kind: "text", text: "{}", fileName: "routine.json" });
    expect(file.text).toHaveBeenCalledTimes(1);
  });

  it("rejects files above the size limit without reading them", async () => {
    const file = fileWith("unused", MAX_ROUTINE_FILE_BYTES + 1);

    await expect(readImportFile(file)).resolves.toMatchObject({ kind: "error", reason: "too-large" });
    expect(file.text).not.toHaveBeenCalled();
  });

  it("strips one leading BOM and preserves every other character", async () => {
    const text = '\uFEFF { "days": [], "note": "keep\\nspacing" }  ';

    await expect(readImportFile(fileWith(text))).resolves.toEqual({ kind: "text", text: text.slice(1), fileName: "routine.json" });
  });

  it.each(["", "not json", "{\"days\":["])("passes invalid content through unchanged", async (text) => {
    await expect(readImportFile(fileWith(text))).resolves.toMatchObject({ kind: "text", text });
  });

  it("rejects workspace backups but passes routine JSON through", async () => {
    await expect(readImportFile(fileWith('{"programs":[],"logs":[]}'))).resolves.toMatchObject({
      kind: "error",
      reason: "backup",
      message: expect.stringContaining("Restore it in Settings."),
    });
    await expect(readImportFile(fileWith('{"days":[],"programs":[]}'))).resolves.toMatchObject({ kind: "text" });
  });

  it("returns a fixed message when reading fails", async () => {
    const file = { name: "routine.json", size: 2, text: jest.fn().mockRejectedValue(new Error("private details")) } as unknown as File;

    const result = await readImportFile(file);
    expect(result).toMatchObject({ kind: "error", reason: "read" });
    expect(JSON.stringify(result)).not.toContain("private details");
  });
});
