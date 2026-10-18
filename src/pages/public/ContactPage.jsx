import { ContactForm, OfficeDirectory } from '../../components/public/ContactUs.jsx';

/**
 * Contact Us, as its own page: each environment office's details, as it keeps
 * them in Settings, and the form that writes to the office the visitor chooses.
 */
export default function ContactPage() {
  return (
    <div className="bg-white px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          <span className="text-green-800">Contact </span>
          <span className="text-gray-900">Us</span>
        </h1>
        <p className="mt-3 max-w-3xl text-base text-gray-700">
          Write to PGENRO, or to your own city or municipality&apos;s environment office. Your message goes to that office
          only, and they reply to you by email.
        </p>
        <div className="mt-10">
          <OfficeDirectory />
        </div>
        <div className="rounded-3xl bg-[#DCE1E3] p-6 shadow-inner sm:p-10">
          <ContactForm />
        </div>
      </div>
    </div>
  );
}
