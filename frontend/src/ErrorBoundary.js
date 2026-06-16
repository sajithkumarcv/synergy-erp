import React from 'react';
import { logClientError } from './errorLog';

// Catches render-time errors anywhere in the child tree, logs them to the
// backend (TBL_APP_LOG), and shows a friendly fallback instead of a white screen.
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

    handleReload = () => {
        this.setState({ hasError: false });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, color: '#475569', textAlign: 'center', padding: 24 }}>
                    <div style={{ fontSize: 44 }}>⚠️</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Something went wrong</div>
                    <div style={{ fontSize: 13 }}>The error has been logged. Try reloading the page.</div>
                    <button onClick={this.handleReload}
                        style={{ marginTop: 8, padding: '8px 22px', borderRadius: 6, border: 'none', background: '#1e40af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                        Reload
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
