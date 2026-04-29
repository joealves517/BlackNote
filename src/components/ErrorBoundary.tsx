import React, { Component, ErrorInfo, ReactNode } from "react";
import { PlugZapIcon, type PlugZapIconHandle } from "@/components/icons/plug-zap";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };
  
  private iconRef = React.createRef<PlugZapIconHandle>();

  public componentDidMount() {
    window.addEventListener("error", this.handleGlobalError);
    window.addEventListener("unhandledrejection", this.handleGlobalPromiseRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener("error", this.handleGlobalError);
    window.removeEventListener("unhandledrejection", this.handleGlobalPromiseRejection);
  }

  private handleGlobalError = (event: ErrorEvent) => {
    this.setState({ hasError: true });
    console.error("Global error caught by boundary:", event.error);
  };

  private handleGlobalPromiseRejection = (event: PromiseRejectionEvent) => {
    this.setState({ hasError: true });
    console.error("Unhandled promise rejection caught by boundary:", event.reason);
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in React tree:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.state.hasError && !prevState.hasError && this.iconRef.current) {
      this.iconRef.current.startAnimation();
    }
  }

  public render() {
    if (this.state.hasError) {
      // Small timeout to ensure ref is attached before animating
      setTimeout(() => {
        if (this.iconRef.current) {
          this.iconRef.current.startAnimation();
        }
      }, 50);
      
      return (
        <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-center p-6">
          <PlugZapIcon ref={this.iconRef} size={64} className="text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground">
            Oops, something went wrong
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
