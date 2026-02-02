const LoadingScreen = ({ label = 'Loading your workspace...' }: { label?: string }) => {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-500" />
      <p className="text-sm font-semibold text-brand-600">{label}</p>
    </div>
  )
}

export default LoadingScreen
