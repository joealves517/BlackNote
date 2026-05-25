import { generateJSON } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { marked } from "marked";

const html = marked.parse("Here is <span style=\"color: red\">red</span> text");
console.log("HTML:", html);

const json = generateJSON(html, [
  StarterKit,
  TextStyle,
  Color
]);
console.log("JSON:", JSON.stringify(json, null, 2));
