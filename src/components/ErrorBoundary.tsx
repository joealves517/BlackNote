import React, { Component, ErrorInfo, ReactNode } from "react";
import { PlugZapIcon, type PlugZapIconHandle } from "@/components/icons/plug-zap";
import { SupportActionSheet } from "@/components/SupportActionSheet";
import { MessageCircleIcon, HomeIcon } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { getCurrentUser } from "@/lib/auth-client";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  showSupportSheet: boolean;
  hasUser: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showSupportSheet: false,
    hasUser: false
  };
  
  private iconRef = React.createRef<PlugZapIconHandle>();

  public componentDidMount() {
    window.addEventListener("error", this.handleGlobalError);
    window.addEventListener("unhandledrejection", this.handleGlobalPromiseRejection);
    getCurrentUser().then(user => {
      if (user) {
        this.setState({ hasUser: true });
      }
    });
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

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
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
        <div className="flex flex-col items-center justify-center w-full h-screen bg-background text-center p-6 relative overflow-hidden">
          <AnimatePresence>
            {this.state.showSupportSheet && (
              <SupportActionSheet onClose={() => this.setState({ showSupportSheet: false })} />
            )}
          </AnimatePresence>

          <PlugZapIcon ref={this.iconRef} size={64} className="text-muted-foreground mb-4" />
          <p className="text-lg font-medium text-muted-foreground mb-6">
            Oops, something went wrong
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={this.handleReset}
              className="px-6 py-[10px] min-w-[160px] bg-primary text-primary-foreground font-medium rounded-full flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-opacity active:scale-95 border border-zinc-200 dark:border-zinc-800"
            >
              <HomeIcon size={16} />
              Return Home
            </button>
            {this.state.hasUser && (
              <button
                onClick={() => this.setState({ showSupportSheet: true })}
                className="px-6 py-[10px] min-w-[160px] bg-transparent text-muted-foreground font-medium rounded-full flex items-center justify-center gap-2 hover:bg-muted/50 transition-colors active:scale-95 border border-border/80"
              >
                <MessageCircleIcon size={16} />
                Contact Support
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
