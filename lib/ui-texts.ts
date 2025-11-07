import { promises as fs } from "fs";
import path from "path";

export type UiTextMap = Record<string, string>;

const UI_TEXTS_PATH = path.join(process.cwd(), "content", "ui-texts.json");

export async function readUiTexts(): Promise<UiTextMap> {
  try {
    const raw = await fs.readFile(UI_TEXTS_PATH, "utf8");
    const data = JSON.parse(raw) as UiTextMap;

    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function writeUiTexts(nextValue: UiTextMap): Promise<void> {
  const payload = `${JSON.stringify(nextValue, null, 2)}\n`;

  await fs.writeFile(UI_TEXTS_PATH, payload, "utf8");
}

export async function updateUiText(
  key: string,
  value: string,
): Promise<UiTextMap> {
  const current = await readUiTexts();
  const trimmedKey = key.trim();

  if (!trimmedKey) {
    throw new Error("Text key is required.");
  }
  const next = {
    ...current,
    [trimmedKey]: value,
  };

  await writeUiTexts(next);

  return next;
}
