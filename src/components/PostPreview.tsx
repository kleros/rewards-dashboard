import { useEffect, useRef, useState } from "react";
import styled, { useTheme } from "styled-components";

// Preview of an entry's public post. X posts are embedded with X's official
// widget; any other link gets a plain card. The program keeps no copy of the
// content, so when a post is deleted or made private the preview says so.

declare global {
  interface Window {
    twttr?: {
      widgets: {
        createTweet: (
          id: string,
          target: HTMLElement,
          options?: { theme?: "light" | "dark"; dnt?: boolean; conversation?: "none" | "all" }
        ) => Promise<HTMLElement | undefined>;
      };
    };
  }
}

const X_STATUS = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i;
const X_WIDGETS_URL = "https://platform.twitter.com/widgets.js";

let widgetsScript: Promise<void> | null = null;

function loadXWidgets(): Promise<void> {
  if (window.twttr?.widgets) return Promise.resolve();
  if (!widgetsScript) {
    widgetsScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = X_WIDGETS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        widgetsScript = null;
        reject(new Error("could not load the X embed script"));
      };
      document.head.appendChild(script);
    });
  }
  return widgetsScript;
}

const Card = styled.a`
  display: block;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.stroke};
  background: ${({ theme }) => theme.lightGrey};
  color: ${({ theme }) => theme.primaryText};
  text-decoration: none;
  max-width: 550px;

  &:hover {
    border-color: ${({ theme }) => theme.strokeHover};
  }
`;

const Host = styled.div`
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.secondaryText};
  margin-bottom: 4px;
`;

const Url = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.primaryBlue};
  word-break: break-all;
`;

const Unavailable = styled.div`
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.error};
  background: ${({ theme }) => theme.errorLight};
  border: 1px solid ${({ theme }) => theme.stroke};
  max-width: 550px;
`;

const Loading = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.secondaryText};
  padding: 12px 0;
`;

function LinkCard({ link }: { link: string }) {
  let host = link;
  try {
    host = new URL(link).hostname.replace(/^www\./, "");
  } catch {
    // Not a URL: show it as it is.
  }
  return (
    <Card href={link} target="_blank" rel="noreferrer">
      <Host>{host}</Host>
      <Url>{link}</Url>
    </Card>
  );
}

function XEmbed({ id, link }: { id: string; link: string }) {
  const target = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const [state, setState] = useState<"loading" | "shown" | "unavailable">("loading");

  useEffect(() => {
    let cancelled = false;
    const element = target.current;
    if (!element) return;
    element.innerHTML = "";
    setState("loading");

    loadXWidgets()
      .then(() => window.twttr?.widgets.createTweet(id, element, { theme: theme.name === "dark" ? "dark" : "light", dnt: true, conversation: "none" }))
      .then((embedded) => {
        // A superseded run (re-render, or React's development double-mount) must
        // not leave a second copy of the post behind.
        if (cancelled) embedded?.remove();
        else setState(embedded ? "shown" : "unavailable");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
      element.innerHTML = "";
    };
  }, [id, theme.name]);

  return (
    <div>
      {state === "loading" && <Loading>Loading the post from X…</Loading>}
      {state === "unavailable" && (
        <Unavailable>
          This post could not be shown: it may have been deleted or made private, or X may be blocked here.{" "}
          <a href={link} target="_blank" rel="noreferrer">
            Open the link
          </a>
        </Unavailable>
      )}
      <div ref={target} />
    </div>
  );
}

export default function PostPreview({ link }: { link: string }) {
  if (!link) return <Unavailable>This entry has no link.</Unavailable>;
  const xStatus = link.match(X_STATUS);
  return xStatus ? <XEmbed id={xStatus[1]} link={link} /> : <LinkCard link={link} />;
}
