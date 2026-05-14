import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('BikeSafe caught an error:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: '60vh', padding: 40, color: '#e6efff', fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#9fb1c7', marginBottom: 16, maxWidth: 420, textAlign: 'center' }}>
            BikeSafe hit an unexpected error. You can try reloading the map below.
          </p>
          {this.state.error?.message && (
            <pre style={{
              background: '#0b1220', padding: 12, borderRadius: 8,
              border: '1px solid #2a3246', fontSize: 12, color: '#f59e0b',
              maxWidth: '100%', overflow: 'auto', marginBottom: 16,
            }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReset}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 0,
              background: '#60a5fa', color: '#07111f', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Reload map
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
