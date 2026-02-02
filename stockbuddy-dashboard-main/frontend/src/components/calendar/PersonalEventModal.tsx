import type { PersonalEvent } from '../../types/personalEvents'

type Props = {
  open: boolean
  saving: boolean
  editingEvent: PersonalEvent | null
  errorMessage?: string | null
  formTitle: string
  formDescription: string
  formLocation: string
  formStartTime: string
  formEndTime: string
  formRepeat: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  formRepeatUntil: string
  formRemindMinutes: number | null
  onChangeTitle: (value: string) => void
  onChangeDescription: (value: string) => void
  onChangeLocation: (value: string) => void
  onChangeStartTime: (value: string) => void
  onChangeEndTime: (value: string) => void
  onChangeRepeat: (value: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly') => void
  onChangeRepeatUntil: (value: string) => void
  onChangeRemindMinutes: (value: number | null) => void
  onCancel: () => void
  onSave: () => void
  onDelete: () => void
}

const PersonalEventModal = ({
  open,
  saving,
  editingEvent,
  errorMessage,
  formTitle,
  formDescription,
  formLocation,
  formStartTime,
  formEndTime,
  formRepeat,
  formRepeatUntil,
  formRemindMinutes,
  onChangeTitle,
  onChangeDescription,
  onChangeLocation,
  onChangeStartTime,
  onChangeEndTime,
  onChangeRepeat,
  onChangeRepeatUntil,
  onChangeRemindMinutes,
  onCancel,
  onSave,
  onDelete
}: Props) => {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold text-slate-900 mb-1.5">
          {editingEvent ? 'Edit event' : 'Add event'}
        </h2>
        {errorMessage && (
          <div className="mb-2 rounded-lg border border-rose-100 bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
            {errorMessage}
          </div>
        )}
        <div className="flex flex-col gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">Title</span>
            <input
              className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
              value={formTitle}
              onChange={e => onChangeTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">Description</span>
            <textarea
              className="min-h-[60px] rounded-lg border border-slate-200 px-2 py-1 text-xs"
              value={formDescription}
              onChange={e => onChangeDescription(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">Start time</span>
              <input
                type="datetime-local"
                className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
                value={formStartTime}
                onChange={e => onChangeStartTime(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-medium text-slate-700">End time</span>
              <input
                type="datetime-local"
                className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
                value={formEndTime}
                onChange={e => onChangeEndTime(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">Location</span>
            <input
              className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
              value={formLocation}
              onChange={e => onChangeLocation(e.target.value)}
            />
          </label>
          {!editingEvent && (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-medium text-slate-700">Repeat</span>
                <select
                  className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
                  value={formRepeat}
                  onChange={e =>
                    onChangeRepeat(
                      e.target.value as 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
                    )
                  }
                >
                  <option value="none">Do not repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                  <option value="yearly">Every year</option>
                </select>
              </label>
              {formRepeat !== 'none' && (
                <label className="flex flex-col gap-1">
                  <span className="font-medium text-slate-700">Repeat until (optional)</span>
                  <input
                    type="date"
                    className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
                    value={formRepeatUntil}
                    onChange={e => onChangeRepeatUntil(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-700">Reminder</span>
            <select
              className="h-8 rounded-lg border border-slate-200 px-2 text-xs"
              value={formRemindMinutes ?? ''}
              onChange={e => {
                const v = e.target.value
                if (!v) {
                  onChangeRemindMinutes(null)
                } else {
                  onChangeRemindMinutes(Number(v))
                }
              }}
            >
              <option value="">No reminder</option>
              <option value={5}>5 minutes before</option>
              <option value={15}>15 minutes before</option>
              <option value={30}>30 minutes before</option>
              <option value={60}>1 hour before</option>
              <option value={1440}>1 day before</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          {editingEvent ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="text-xs text-rose-600 hover:text-rose-700 cursor-pointer"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="h-8 rounded-full border border-slate-200 px-3 text-xs text-slate-600 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !formTitle.trim()}
              className="h-8 rounded-full bg-sky-600 px-3 text-xs font-medium text-white shadow-sm disabled:opacity-60 cursor-pointer disabled:cursor-auto"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PersonalEventModal
