import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';

import pglLogo from '../assets/PGL_LGU_logo.png';
import pgenroLogo from '../assets/PGENRO_LGU_logo.png';
import lspuLogo from '../assets/LSPU_LGU_logo.png';
import greenTagLogo from '../assets/GreenTag_Logo.png';

export default function PublicFooter() {
  // The top margin is the room the brand mark needs to lean into. Too little of
  // it and the mark lands on whatever the page ended with — on the BioDashboard
  // it sat across the chart.
  return (
    <footer className="relative bg-[#1A6136] text-white pt-16 pb-12 mt-28 sm:mt-32 lg:mt-40">
      {/* Brand mark, peeking over the top edge into that margin */}
      <div className="absolute top-0 right-4 sm:right-10 lg:right-20 -translate-y-[45%] flex items-center pointer-events-none z-10">
        <div className="text-[4rem] sm:text-[6rem] lg:text-[8rem] font-black tracking-tighter leading-none flex items-center drop-shadow-[0_4px_4px_rgba(255,255,255,0.5)]">
          <span className="text-[#1A6136]">green</span>
          <span className="text-gray-900">tag</span>
        </div>
        <img 
          src={greenTagLogo} 
          alt="" 
          className="w-20 sm:w-32 lg:w-40 ml-2 drop-shadow-xl -rotate-12"
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
          
          {/* Column 1: Logos & Description */}
          <div className="space-y-6 mt-4">
            <div className="flex items-center gap-4">
              <img src={pglLogo} alt="PGL Logo" className="w-14 sm:w-16 h-14 sm:h-16 object-contain" />
              <img src={pgenroLogo} alt="PGENRO Logo" className="w-14 sm:w-16 h-14 sm:h-16 object-contain" />
              <img src={lspuLogo} alt="LSPU Logo" className="w-14 sm:w-16 h-14 sm:h-16 object-contain" />
            </div>
            <p className="text-sm leading-relaxed text-green-50/90 text-justify">
              Shaping climate-resilient landscapes through data-driven environmental solutions for a sustainable tomorrow. A collaborative effort from the Laguna State Polytechnic University, Provincial Government of Laguna, and PGENRO - Climate Change Adaptation and Mitigation Division.
            </p>
          </div>

          {/* Column 2: Navigation */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm tracking-widest uppercase mb-6 text-green-100">Navigation</h3>
            <ul className="space-y-3 text-sm text-green-50/90">
              <li>
                <Link to="/about" className="hover:text-white hover:underline transition-all">About Us</Link>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition-all">News and Events</a>
              </li>
              <li>
                <a href="#" className="hover:text-white hover:underline transition-all">Our Partners and Contributors</a>
              </li>
              <li>
                <a href="#contact" className="hover:text-white hover:underline transition-all">Contact Us</a>
              </li>
              <li>
                <Link to="/biodiversity" className="hover:text-white hover:underline transition-all">BioDashboard</Link>
              </li>
              <li>
                <Link to="/public-map" className="hover:text-white hover:underline transition-all">Map</Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact Us */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm tracking-widest uppercase mb-6 text-green-100">Contact Us</h3>
            <ul className="space-y-4 text-sm text-green-50/90">
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 shrink-0 opacity-80" />
                <span>pgenro@laguna.gov.ph | lccao@laguna.gov.ph</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 shrink-0 opacity-80" />
                <span>049 557 1531</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 shrink-0 opacity-80" />
                <span>Provincial Capitol Compound, Santa Cruz, Laguna</span>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </footer>
  );
}
