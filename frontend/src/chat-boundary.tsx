import { Component, type ReactNode } from "react";

/** Keep render failures local; never log conversation content or component props. */
export class ChatBoundary extends Component<
  { children: ReactNode; resetKey: string; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure?.();
  }
  componentDidUpdate(previous: Readonly<ChatBoundary["props"]>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="notice chat-render-error" role="alert">
        <strong>Chat could not be displayed.</strong>
        <p>Your saved conversations have not been deleted. Retry or select another chat.</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          Retry Chat
        </button>
      </section>
    );
  }
}
