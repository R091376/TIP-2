import { Component } from 'react'

/**
 * Catches render errors so a chart throw does not blank the whole app.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('UI error boundary', error, info?.componentStack)
    }
  }

  render() {
    if (this.state.error) {
      const msg =
        this.state.error instanceof Error
          ? this.state.error.message
          : String(this.state.error)
      return (
        <div className="auth-page" role="alert">
          <div className="auth-card">
            <h1 className="auth-card__title">Something went wrong</h1>
            <p className="auth-card__hint">{msg}</p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                this.setState({ error: null })
                if (this.props.onReset) this.props.onReset()
                else window.location.assign('/')
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
