import {
  readFile,
  createFile,
  writeDirTool,
  listFilesTool,
  editFileTool,
} from "./fileHandlerTools";

const tools = [readFile, createFile, writeDirTool, listFilesTool, editFileTool];

export default tools;
