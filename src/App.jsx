import BikeSafeMap from './components/BikeSafeMap.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

export default function App(){
  return (
    <div className="app">
      <ErrorBoundary>
        <BikeSafeMap />
      </ErrorBoundary>
    </div>
  )
}
