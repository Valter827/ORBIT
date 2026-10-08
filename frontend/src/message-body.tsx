import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, isValidElement, type ReactNode } from "react";
import { CopyButton } from "./components";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
function CodeBlock({ language, code }: { language: string; code: string }) {
  return (
    <figure className="message-code">
      <figcaption>
        <span>{language || "Code"}</span>
        <CopyButton text={code} label="Copy code" />
      </figcaption>
      <pre tabIndex={0} aria-label={language ? language + " code" : "Code"}>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
function textContent(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textContent(child.props.children)
          : "",
    )
    .join("");
}
export function MessageBody({ text }: { text: string }) {
  return (
    <div className="message-body">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [
            rehypeKatex,
            {
              trust: false,
              strict: "error",
              throwOnError: false,
              maxExpand: 100,
              maxSize: 20,
              output: "htmlAndMathml",
            },
          ],
        ]}
        skipHtml
        urlTransform={(url) => (/^https:\/\//i.test(url) ? url : "")}
        components={{
          pre: ({ children }) => {
            const element = Children.toArray(children).find((child) => isValidElement(child));
            const language = isValidElement<{ className?: string }>(element)
              ? (element.props.className?.replace(/^language-/, "") ?? "")
              : "";
            return <CodeBlock language={language} code={textContent(children).replace(/\n$/, "")} />;
          },
          a: ({ href, children }) =>
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
          table: ({ children }) => (
            <div className="markdown-table" tabIndex={0}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
