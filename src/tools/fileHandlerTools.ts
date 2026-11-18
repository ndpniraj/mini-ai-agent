import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { AgentTool } from "../types/tools";

export const readFile: AgentTool = {
  name: "read_file",
  description:
    "Use this when you want to read the content from inside the file. You can provide the relative path of the file and do not use it for any other task than this.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of the file inside the working dir.",
      },
    },
    required: ["path"],
  },
  async fun(args) {
    const filePath = args.path;
    const resolvedFilePath = path.resolve(filePath);

    if (!existsSync(resolvedFilePath))
      throw Error(`File doesn't exists: ${filePath}`);

    try {
      return await fs.readFile(resolvedFilePath, "utf-8");
    } catch (error) {
      return `Can't read the file: ${error instanceof Error ? error.message : error}`;
    }
  },
};

export const createFile: AgentTool = {
  name: "create_file",
  description:
    "It creates a file and writes content in it. Use it when you want to create new file and want to write some content but not to create folder/folders.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "A complete file path with the file name and extension like: fileName.{txt/js/ts etc}. Needs relative file path, this will create and save the file in the given path. Do not use it to create folders.",
      },
      content: {
        type: "string",
        description:
          "The content that you want to save inside the given file path.",
      },
    },
    required: ["path", "content"],
  },
  async fun(args) {
    const { path, content } = args;

    if (typeof content !== "string") {
      throw new Error(`Missing required argument "content" (string).`);
    }

    try {
      await fs.writeFile(path, content, "utf8");
      return `Created ${path} (${content.length} bytes)`;
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  },
};

export const writeDirTool: AgentTool = {
  name: "write_file",
  description:
    "use it to create folder/folders in a recursive way. Do not use it for file creation just folders.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "a relative file path to create folders or directories.",
      },
    },
    required: ["path"],
  },
  async fun(args) {
    const filePath = args.path;

    const resolvedPath = path.resolve(filePath);

    if (existsSync(resolvedPath)) {
      throw new Error(`The directory already exists: ${filePath}`);
    }

    try {
      await fs.mkdir(filePath, { recursive: true });
      return "Folder created successfully!";
      return "";
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  },
};

export const listFilesTool: AgentTool = {
  name: "list_files",

  description: `List files and directories at a given path. If no
     path is provided, lists files in the current
     directory.`,

  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: `Optional relative path to list files from.
           Defaults to current directory if not
           provided.`,
      },
    },
    required: [],
  },

  fun: async (args) => {
    const filePath: string = args.path ?? ".";
    const resolvedPath = path.resolve(filePath);

    // Check if path exists and is a directory
    if (!existsSync(resolvedPath)) {
      throw new Error(`Directory not found: ${filePath}`);
    }
    const stat = await fs.stat(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`${filePath} is not a directory`);
    }
    try {
      const dir = await fs.readdir(resolvedPath);
      const entriesWithDirectoryMarkers = await Promise.all(
        dir.map(async (entry) => {
          const fullPath = path.join(resolvedPath, entry);
          try {
            const stats = await fs.stat(fullPath);
            return stats.isDirectory() ? `${entry}/` : entry;
          } catch (error) {
            return entry;
          }
        }),
      );
      return JSON.stringify(entriesWithDirectoryMarkers);
    } catch (error) {
      throw new Error(
        `Error reading dir: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
};

export const editFileTool: AgentTool = {
  name: "edit_file",

  description: `Make edits to a text file. Replaces
    'old_str' with 'new_str' in the given file.
    'old_str' and 'new_str' MUST be different from
    each other. If the file specified with path
    doesn't exist, it will be created.`,

  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of a file in the working directory.",
      },
      old_str: {
        type: "string",
        description: "The string to replace in the file.",
      },
      new_str: {
        type: "string",
        description: "The string to replace with.",
      },
    },
    required: ["path", "old_str", "new_str"],
  },

  fun: async (args) => {
    const filePath: string = args.path;
    const oldStr: string = args.old_str;
    const newStr: string = args.new_str;
    const resolvedPath = path.resolve(filePath);

    // Validate that old_str and new_str are different
    if (oldStr === newStr) {
      throw new Error(`'old_str' and 'new_str' must be
        different from each other`);
    }

    try {
      let fileContent: string;

      // Check if file exists
      if (existsSync(resolvedPath) && oldStr !== "") {
        // Read existing file content
        fileContent = await fs.readFile(resolvedPath, "utf-8");

        // Check if old_str exists in the file
        if (!fileContent.includes(oldStr)) {
          return `No changes made:
            String '${oldStr}' not found in the file.`;
        }

        // Replace all occurrences of old_str with new_str
        const splitParts = fileContent.split(oldStr);
        const newContent = splitParts.join(newStr);

        // Write the modified content back to the file
        await fs.writeFile(resolvedPath, newContent, "utf-8");

        // Count replacements:
        // splitParts.length - 1 gives the number of
        // delimiters (oldStr) found
        const occurrences = splitParts.length - 1;
        return `Successfully made ${occurrences}
          replacement${occurrences !== 1 ? "s" : ""}
          in ${filePath}`;
      } else if (oldStr === "") {
        await fs.writeFile(resolvedPath, newStr, "utf-8");
        return `Created new file ${filePath} with the provided
          content`;
      }

      // Throw error for the case where the file doesn't exist and oldStr is not empty
      throw new Error(`File ${filePath} does not exist.`);
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  },
};
