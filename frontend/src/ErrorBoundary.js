import React from 'react';
import { logClientError } from './errorLog';
import { CrashPage } from './ErrorPage';

// Catches render-time errors anywhere in the child tree, logs them to the
// backend (TBL_APP_LOG), and shows an error page instead of a white screen.
//
// `resetKey`: when it changes (Layout passes the current URL path) a crashed boundary clears itself, so a
// crash on one page no longer traps the user - navigating elsewhere (menu, Dashboard) works again.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        const firstFrame = info?.componentStack?.split('\n').map(s => s.trim()).filter(Boolean)[0] || null;
        logClientError(error, { source: 'ErrorBoundary', action: firstFrame });
    }

    componentDidUpdate(prevProps) {
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false });
        }
    }

    handleReload = () => {
        this.setState({ hasError: false });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) return <CrashPage onRetry={this.handleReload} />;
        return this.props.children;
    }
}

export default ErrorBoundary;
