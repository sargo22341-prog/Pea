import { Component, type ErrorInfo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] render error", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <AppErrorFallback />;
    return this.props.children;
  }
}

function AppErrorFallback() {
  const { t } = useTranslation("common");
  return (
    <div className="flex flex-col items-start gap-3 p-6 text-slate-300">
      <p className="font-semibold">{t("appError.title")}</p>
      <p className="text-sm text-slate-400">{t("appError.description")}</p>
      <button
        className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-slate-100 hover:bg-slate-600"
        onClick={() => window.location.reload()}
        type="button"
      >
        {t("appError.reload")}
      </button>
    </div>
  );
}
