import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * A password field with a button to show or hide what was typed (29
 * October), for sign-in and sign-up. `className` styles the input; room is
 * kept on the right for the button.
 */
export default function PasswordInput({ className = '', ...input }) {
  const [shown, setShown] = useState(false);
  return (
    <>
      <input {...input} type={shown ? 'text' : 'password'} className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
      >
        {shown ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      </button>
    </>
  );
}
