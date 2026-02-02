import React from 'react'
import { Chatbot } from '../components/Chatbot'
import DashboardLayout from '../components/DashboardLayout'

export const ChatbotPage: React.FC = () => {
  return (
    <DashboardLayout
      header={
        <div>
          <h1 className="text-3xl font-bold text-slate-900">AI Assistant</h1>
          <p className="mt-2 text-slate-600">
            Natural language interface for transactions and queries
          </p>
        </div>
      }
    >
      <div className="h-[calc(100vh-12rem)]">
        <Chatbot fullPage={true} />
      </div>
    </DashboardLayout>
  )
}
