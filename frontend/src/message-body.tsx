import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Children, isValidElement, type ReactNode } from "react";
import { useState } from "react";
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [status, setStatus] = useState("");
  return (
    <figure className="message-code">
      <figcaption>
        <span>{language || "Code"}</span>
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              .writeText(code)
              .then(() => setStatus("Copied"))
              .catch(() => setStatus("Copy unavailable"))
          }
        >
          {status || "Copy code"}
        </button>
      </figcaption>
      <pre>
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
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^(https?:\/\/|mailto:)/i.test(url) ? url : "")}
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
