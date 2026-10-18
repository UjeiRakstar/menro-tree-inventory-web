import { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, TreePine, BarChart3, BarChart2, ShieldAlert, Smartphone, Monitor, ChevronDown, Compass } from 'lucide-react';
import NewsBanner from '../../components/public/NewsBanner.jsx';
import { ContactForm, OfficeDirectory } from '../../components/public/ContactUs.jsx';

import forestcoverImg from '../../assets/optimised/forestcover.avif';
import greenTagLogo from '../../assets/GreenTag_Logo.png';
import mobileImg from '../../assets/Mobile.jpg';
import mobileview_mapImg from '../../assets/mobileview_map.jpg';
import desktopImg from '../../assets/desktop.PNG';
import mappingFeatureImg from '../../assets/optimised/Mapping-Feature.webp';
import sdg9Img from '../../assets/SDG9.png';
import sdg11Img from '../../assets/SDG11.png';
import sdg13Img from '../../assets/SDG13.png';
import sdg15Img from '../../assets/SDG15.png';
import pglLogo from '../../assets/lgu-thumbs/large/PGL_LGU_logo.png';
import pgenroLogo from '../../assets/lgu-thumbs/large/PGENRO_LGU_logo.png';
import lspuLogo from '../../assets/lgu-thumbs/large/LSPU_LGU_logo.png';
import noahLogo from '../../assets/noah_logo.png';
import bswmLogo from '../../assets/optimised/BSWM_logo.png';
import copernicusLogo from '../../assets/Copernicus_logo.png';
import namriaLogo from '../../assets/optimised/NAMRIA_logo.png';
import dostLogo from '../../assets/DOST_PAGASA_logo.svg';

/* ══════════════════════════════════════════════════
   Who is behind this, and where their data comes from
   ══════════════════════════════════════════════════ */

/** The three institutions that run Green Tag between them. */
const PARTNERS = [
  { name: 'Provincial Government of Laguna', href: 'https://laguna.gov.ph/', logo: pglLogo },
  { name: 'PGENRO', href: 'https://www.facebook.com/enro.laguna', logo: pgenroLogo },
  { name: 'Laguna State Polytechnic University', href: 'https://lspu.edu.ph/', logo: lspuLogo },
];

/**
 * The agencies whose data the platform reads, in the order the paragraph above
 * them names. `size` is set per logo because a seal and a wordmark do not read
 * as the same size at the same height.
 */
const DATA_SOURCES = [
  { name: 'NAMRIA', href: 'https://www.namria.gov.ph/', logo: namriaLogo, size: 'h-14 sm:h-16' },
  { name: 'BSWM', href: 'https://www.bswm.da.gov.ph/', logo: bswmLogo, size: 'h-14 sm:h-16' },
  { name: 'UPRI NOAH', href: 'https://noah.up.edu.ph/', logo: noahLogo, size: 'h-8 sm:h-10' },
  { name: 'Copernicus', href: 'https://www.copernicus.eu/en', logo: copernicusLogo, size: 'h-8 sm:h-10' },
  { name: 'DOST-PAGASA', href: 'https://www.pagasa.dost.gov.ph/', logo: dostLogo, size: 'h-14 sm:h-16' },
];

/* ══════════════════════════════════════════════════
   Animation Hooks
   ══════════════════════════════════════════════════ */

/** Intersection Observer hook — triggers once when element scrolls into view */
function useFadeIn(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

/** Parallax scroll hook — returns a Y offset for subtle depth effect */
/**
 * Shifts an element against the scroll.
 *
 * [limit] caps the shift in pixels. Whatever is being moved has to be larger
 * than its frame by at least that much in each direction, or the frame shows
 * through — which is where the grey line under the navbar came from: at rest
 * the hero sits below the sticky bar, so rect.top was already 68px and the
 * image started life pushed down off its own frame.
 */
function useParallax(speed = 0.3, limit = 80) {
  const [offset, setOffset] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const shift = rect.top * speed;
      setOffset(Math.max(-limit, Math.min(limit, shift)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [speed, limit]);

  return { ref, offset };
}

/* ══════════════════════════════════════════════════
   Reusable Sub-Components
   ══════════════════════════════════════════════════ */

/**
 * A logo that links to the organisation it belongs to.
 *
 * Opens in its own tab so a visitor reading the page does not lose their
 * place, with rel="noreferrer" because these are other people's sites.
 */
function LogoLink({ href, name, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${name} — opens in a new tab`}
      title={name}
      className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
    >
      {children}
    </a>
  );
}

/** Scroll-triggered fade-in wrapper with configurable direction */
function FadeIn({ children, delay = 0, className = '', direction = 'up' }) {
  const { ref, visible } = useFadeIn();
  const transforms = {
    up: visible ? 'translate-y-0' : 'translate-y-10',
    down: visible ? 'translate-y-0' : '-translate-y-10',
    left: visible ? 'translate-x-0' : 'translate-x-10',
    right: visible ? 'translate-x-0' : '-translate-x-10',
    none: '',
  };
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${transforms[direction]} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Animated counter — counts from 0 to target when visible */
function AnimatedNumber({ value, suffix = '', duration = 2000, className = '' }) {
  const { ref, visible } = useFadeIn(0.5);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(value * eased));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [visible, value, duration]);

  return (
    <span ref={ref} className={className}>
      {current.toLocaleString()}{suffix}
    </span>
  );
}

/** SDG Card with hover lift effect */
function SdgCard({ image, altText, description, delay }) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      className="group flex flex-col items-center"
    >
      <div
        className={`w-full max-w-[200px] rounded-xl overflow-hidden mb-4 shadow-md
                    group-hover:shadow-xl group-hover:-translate-y-2 transition-all duration-500 ease-out ${
          visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'
        }`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        <img src={image} alt={altText} className="w-full h-auto object-cover" />
      </div>
      <div
        className={`bg-gradient-to-r from-green-600 to-green-500 text-white text-xs sm:text-sm
                    font-medium px-4 py-2.5 rounded-lg w-full max-w-[200px] text-center shadow-sm
                    transition-all duration-700 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: `${delay + 500}ms` }}
      >
        {description}
      </div>
    </div>
  );
}

/** Infographic stat pill */
function StatPill({ icon: Icon, number, suffix, label, delay }) {
  return (
    <FadeIn delay={delay} className="flex flex-col items-center text-center">
      <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center mb-3
                      ring-1 ring-white/20">
        <Icon className="text-green-300" size={24} />
      </div>
      <div className="text-3xl sm:text-4xl font-black text-white leading-none mb-1">
        <AnimatedNumber value={number} suffix={suffix} />
      </div>
      <div className="text-xs sm:text-sm text-green-200/80 font-medium uppercase tracking-wide">
        {label}
      </div>
    </FadeIn>
  );
}

/** Feature row — icon + title + description */
function FeatureRow({ icon: Icon, title, description, delay = 0 }) {
  return (
    <FadeIn delay={delay} direction="left" className="flex gap-4 items-start group">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center
                      group-hover:bg-green-600 group-hover:text-white transition-colors duration-300">
        <Icon className="text-green-700 group-hover:text-white transition-colors duration-300" size={20} />
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-gray-900 text-sm sm:text-base uppercase tracking-wide mb-1">
          {title}
        </h3>
        <p className="text-gray-600 text-sm leading-relaxed">
          {description}
        </p>
      </div>
    </FadeIn>
  );
}

/* ══════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════ */

export default function AboutUs() {
  const [heroLoaded, setHeroLoaded] = useState(false);
  const heroParallax = useParallax(0.25);

  useEffect(() => {
    const timer = setTimeout(() => setHeroLoaded(true), 150);
    return () => clearTimeout(timer);
  }, []);

  const scrollToContent = useCallback(() => {
    window.scrollTo({ top: window.innerHeight * 0.85, behavior: 'smooth' });
  }, []);

  return (
    <div className="bg-white min-h-screen overflow-x-hidden">

      {/* ═══════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col" ref={heroParallax.ref}>
        {/* Background Image — upper ~65% */}
        <div className="relative flex-1 min-h-[50vh] sm:min-h-[55vh] md:min-h-[62vh] overflow-hidden bg-green-900">
          {/* Taller than its frame by more than the parallax can shift it, so
              the frame never shows above or below the canopy. */}
          <img
            src={forestcoverImg}
            alt="Lush forest canopy of Laguna"
            className="absolute inset-x-0 -top-24 w-full h-[calc(100%+12rem)] object-cover"
            style={{ transform: `translate3d(0, ${heroParallax.offset}px, 0)` }}
          />
          {/* Cinematic gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-green-900/40" />

          {/* Floating diamond logo watermark */}
          <div
            className={`absolute bottom-8 right-8 sm:bottom-12 sm:right-12 transition-all duration-1000 ease-out ${
              heroLoaded ? 'opacity-20 translate-y-0 rotate-0' : 'opacity-0 translate-y-8 rotate-12'
            }`}
            style={{ transitionDelay: '600ms' }}
          >
            <img
              src={greenTagLogo}
              alt=""
              aria-hidden="true"
              className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 object-contain drop-shadow-2xl"
            />
          </div>

          {/* Scroll hint arrow */}
          <button
            onClick={scrollToContent}
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 hover:text-white
                       animate-bounce transition-all duration-700 ${
              heroLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transitionDelay: '1200ms' }}
            aria-label="Scroll to learn more"
          >
            <ChevronDown size={32} />
          </button>
        </div>

        {/* Lower-Third Content Block */}
        <div className="relative bg-white">
          {/* Decorative multi-line accent */}
          <div className="absolute top-0 left-0 right-0">
            <div className="h-1 bg-gradient-to-r from-green-700 via-green-500 to-green-300" />
            <div className="h-[2px] bg-gradient-to-r from-green-300/40 via-green-200/20 to-transparent mt-px" />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20">
            <div className="flex flex-col lg:flex-row gap-10 lg:gap-20 items-start">

              {/* Left: Editorial Typography */}
              <div
                className={`flex-shrink-0 lg:max-w-[520px] transition-all duration-1000 ease-out ${
                  heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
              >
                {/* Line 1: "greentag tree" */}
                <div className="select-none" style={{ lineHeight: 0.9 }}>
                  <span className="text-[3.2rem] sm:text-[4.2rem] md:text-[5rem] lg:text-[5.8rem] font-extrabold lowercase tracking-tight text-green-600">
                    green
                  </span>
                  <span className="text-[3.2rem] sm:text-[4.2rem] md:text-[5rem] lg:text-[5.8rem] font-extrabold lowercase tracking-tight text-green-400">
                    tag
                  </span>
                  <span className="text-[3.2rem] sm:text-[4.2rem] md:text-[5rem] lg:text-[5.8rem] font-extrabold lowercase tracking-tight text-gray-900 ml-2 sm:ml-3">
                    tree
                  </span>
                </div>

                {/* Line 2: "inventory" */}
                <div className="select-none -mt-1 sm:-mt-2" style={{ lineHeight: 0.85 }}>
                  <span className="text-[3.5rem] sm:text-[4.5rem] md:text-[5.5rem] lg:text-[6.5rem] font-black lowercase tracking-tighter text-gray-900">
                    inventory
                  </span>
                </div>

                {/* Line 3: "system" */}
                <div className="select-none -mt-1 sm:-mt-2" style={{ lineHeight: 0.85 }}>
                  <span className="text-[3.5rem] sm:text-[4.5rem] md:text-[5.5rem] lg:text-[6.5rem] font-black lowercase tracking-tighter text-gray-900">
                    system
                  </span>
                </div>
              </div>

              {/* Right: Description + mini logo */}
              <div
                className={`flex-1 flex flex-col justify-center transition-all duration-1000 ease-out ${
                  heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: '400ms' }}
              >
                {/* Decorative leaf accent */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-[2px] bg-green-500 rounded-full" />
                  <Leaf className="text-green-500" size={16} />
                </div>

                <p className="text-gray-700 text-[15px] sm:text-base md:text-lg leading-relaxed text-left sm:text-justify mb-6">
                  The Green Tag Tree Inventory System gives the people of Laguna a
                  fighting chance to address climate change through localized mitigation
                  specifically by protecting our trees and biodiversity. Serving as
                  both a Decision Support System and a crowdsourcing platform, Green
                  Tag empowers the Provincial Government, its 6 cities, and 24
                  municipalities to make data-driven environmental choices.
                  Simultaneously, it educates the community, allowing everyone to tag,
                  identify, and raise awareness about our local forestry. We believe
                  that climate action requires the whole province working together.
                </p>

                {/* Subtle brand lockup */}
                <div className="flex items-center gap-3 opacity-60">
                  <img src={greenTagLogo} alt="" className="w-8 h-8 object-contain" />
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Provincial Government of Laguna
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PGENRO's News & Events, when there are any */}
      <NewsBanner />

      {/* ═══════════════════════════════════════════
          IMPACT STATS BAR — Animated Counters
          ═══════════════════════════════════════════ */}
      <section className="bg-gradient-to-r from-green-800 via-green-700 to-green-800 py-12 sm:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
            <StatPill icon={TreePine} number={6} suffix="" label="Cities" delay={0} />
            <StatPill icon={BarChart3} number={24} suffix="" label="Municipalities" delay={150} />
            <StatPill icon={Leaf} number={1} suffix="" label="Province" delay={300} />
            <StatPill icon={ShieldAlert} number={30} suffix="" label="LGUs United" delay={450} />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          SDG SECTION
          ═══════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto text-center">
          <FadeIn>
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="w-10 h-[2px] bg-green-500 rounded-full" />
              <span className="text-xs font-bold text-green-600 uppercase tracking-[0.2em]">
                Aligned with the United Nations
              </span>
              <div className="w-10 h-[2px] bg-green-500 rounded-full" />
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 uppercase tracking-wide mb-4">
              For a Greener, Better,
              <br className="hidden sm:block" />
              Sustainable Laguna
            </h2>
            <p className="text-gray-500 text-sm sm:text-base max-w-2xl mx-auto mb-14">
              Our initiatives directly support four United Nations Sustainable Development Goals,
              ensuring every action we take contributes to a global movement.
            </p>
          </FadeIn>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            <SdgCard
              image={sdg9Img}
              altText="SDG 9 – Industry, Innovation and Infrastructure"
              delay={0}
              description="Digital tools and smart infrastructure enable precise tree monitoring across the municipality."
            />
            <SdgCard
              image={sdg11Img}
              altText="SDG 11 – Sustainable Cities and Communities"
              delay={200}
              description="Mapping urban green spaces builds safer, more livable communities for every barangay."
            />
            <SdgCard
              image={sdg13Img}
              altText="SDG 13 – Climate Action"
              delay={400}
              description="Carbon sequestration data turns every tree into a measurable climate action asset."
            />
            <SdgCard
              image={sdg15Img}
              altText="SDG 15 – Life on Land"
              delay={600}
              description="Cataloging native species protects terrestrial biodiversity and flags at-risk trees."
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CROWDSOURCING — Community Action
          ═══════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
            
            {/* Left: Dual Phone Mockups */}
            <div className="flex-1 w-full flex justify-center lg:justify-end relative min-h-[500px]">
              {/* Back Phone: Map View */}
              <FadeIn direction="right" delay={200} className="absolute left-0 sm:left-[20%] lg:left-[5%] top-0 z-10">
                <div className="relative w-48 sm:w-56 h-[380px] sm:h-[440px] bg-gray-900 rounded-[2rem] p-2 sm:p-3 shadow-2xl ring-1 ring-gray-200 transform -rotate-6 transition-transform duration-500 hover:rotate-0 hover:z-30">
                  <div className="w-full h-full rounded-[1.5rem] sm:rounded-[1.75rem] overflow-hidden bg-white">
                    <img
                      src={mobileview_mapImg}
                      alt="Map view on mobile"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Notch */}
                  <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 w-16 h-4 sm:w-20 sm:h-5 bg-gray-900 rounded-full" />
                </div>
              </FadeIn>

              {/* Front Phone: App/Seedling View */}
              <FadeIn direction="up" delay={400} className="absolute right-0 sm:right-[20%] lg:right-[15%] top-12 sm:top-16 z-20">
                <div className="relative w-52 sm:w-64 h-[400px] sm:h-[480px] bg-white rounded-[2rem] sm:rounded-[2.5rem] p-2 sm:p-3 shadow-[0_20px_50px_rgba(0,0,0,0.3)] ring-1 ring-gray-100 transform rotate-3 transition-transform duration-500 hover:-rotate-2 hover:scale-105">
                  <div className="w-full h-full rounded-[1.5rem] sm:rounded-[2rem] overflow-hidden">
                    <img
                      src={mobileImg}
                      alt="Tree inventory mobile app preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* Notch */}
                  <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 w-16 h-4 sm:w-20 sm:h-5 bg-white rounded-full" />
                  
                  {/* Badge */}
                  <div className="absolute -bottom-4 -left-4 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-green-700
                                  rounded-xl sm:rounded-2xl -rotate-12 flex items-center justify-center shadow-lg border-2 border-white">
                    <Smartphone className="text-white rotate-12" size={20} />
                  </div>
                </div>
              </FadeIn>
            </div>

            {/* Right: Content */}
            <div className="flex-1 space-y-2 mt-8 lg:mt-0 z-30">
              <FadeIn>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-[2px] bg-green-500 rounded-full" />
                  <span className="text-xs sm:text-sm font-bold text-green-600 uppercase tracking-[0.15em]">
                    Community Action & Smart Technology
                  </span>
                </div>
                
                <h2 className="text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] font-light italic text-gray-500 tracking-tight leading-none mb-1">
                  Pagbabago ng Klima,
                </h2>
                <h2 className="text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] font-black text-gray-900 tracking-tight leading-none mb-8">
                  Kaya ng Laguna
                </h2>
              </FadeIn>

              <div className="space-y-5 mb-8">
                <FeatureRow
                  icon={Leaf}
                  title="Crowdsourcing"
                  delay={100}
                  description="Environmental stewardship belongs to all of us. Spot a remarkable tree in your
                    neighborhood — a towering acacia or a flowering molave — and help document it.
                    Tag its GPS location, snap a photo, and submit through our public portal."
                />
                <FeatureRow
                  icon={BarChart3}
                  title="Data Collection"
                  delay={200}
                  description="Every verified tree submission strengthens our collective understanding of Santa
                    Cruz's urban forest. Species identification, health assessments, and geolocation
                    data flow into a centralized system that powers real-time environmental decision-making."
                />
                <FeatureRow
                  icon={Smartphone}
                  title="Fun and Simple"
                  delay={300}
                  description="No technical expertise required. Open the app on your smartphone, point your
                    camera at a tree, and let the system guide you through the rest. It takes less
                    than two minutes to make a meaningful contribution to your community's green future."
                />
              </div>

              {/* Call to Action Button */}
              <FadeIn delay={400} direction="up">
                <div className="mt-12 flex justify-center lg:justify-start">
                  <Link 
                    to="/public-map" 
                    className="inline-flex items-center gap-3 bg-gradient-to-r from-green-700 to-green-600 
                               text-white px-8 py-4 rounded-xl font-bold text-lg 
                               hover:from-green-800 hover:to-green-700 hover:shadow-xl hover:-translate-y-1 
                               transition-all duration-300 group"
                  >
                    <span>Get Involved!</span>
                    <Compass className="w-6 h-6 group-hover:rotate-45 transition-transform duration-500" />
                  </Link>
                </div>
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          DATA & IMPACT — "We Cannot Plan What We Can't Measure"
          ═══════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-center">
            
            {/* Left: Content */}
            <div className="flex-1 space-y-4 z-20">
              <FadeIn>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-[2px] bg-green-500 rounded-full" />
                  <span className="text-xs sm:text-sm font-bold text-green-600 uppercase tracking-[0.15em]">
                    Data-Driven Environmental Planning
                  </span>
                </div>
                
                <h2 className="text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] font-extrabold text-green-800 tracking-tight leading-none mb-1 uppercase">
                  We Cannot Plan
                </h2>
                <h2 className="text-[2.5rem] sm:text-[3.25rem] md:text-[4rem] font-black text-gray-900 tracking-tight leading-none mb-8 uppercase">
                  What We Can&apos;t Measure
                </h2>
              </FadeIn>

              <div className="space-y-6 mb-8 text-gray-700">
                <FeatureRow
                  icon={TreePine}
                  title="Carbon Sequestration Tracking"
                  delay={100}
                  description="Greenhouse gas emissions are no longer just abstract numbers—we can now track and manage them. As a robust Decision Support System, Green Tag empowers LGUs to shape their Forest Land Use Plans (FLUP), Urban Biodiversity Index, and Local Climate Change Action Plans by calculating carbon stock and sequestration potential."
                />
                <FeatureRow
                  icon={Monitor}
                  title="Inter-Agency Data Integration"
                  delay={200}
                  description="The platform identifies verified planting sites approved by the PGENRO Forestry Division and integrates essential data from top agencies: administrative maps from NAMRIA, soil and elevation data from BSWM, climate-adjusted hazard maps from UPRI NOAH, satellite imagery from Copernicus, and CLIRAM data from DOST-PAGASA."
                />
                <FeatureRow
                  icon={ShieldAlert}
                  title="Data-Driven Resilient Decisions"
                  delay={300}
                  description="This wealth of information ensures our leaders make resilient decisions that strictly comply with the City Biodiversity Index."
                />
              </div>

              {/* Call to Action Button */}
              <FadeIn delay={400} direction="up">
                <div className="mt-8 flex justify-center lg:justify-start">
                  <Link 
                    to="/biodiversity" 
                    className="inline-flex items-center gap-3 bg-green-800 text-white px-8 py-4 rounded-xl font-bold text-lg 
                               hover:bg-green-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                  >
                    <span>Look at the Data</span>
                    <BarChart2 className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
                  </Link>
                </div>
              </FadeIn>
            </div>

            {/* Right: Desktop mockup with glow */}
            <FadeIn delay={300} direction="left" className="flex-1 w-full flex justify-center lg:justify-end">
              <div className="relative">
                {/* Ambient glow */}
                <div className="absolute -inset-4 bg-green-500/20 rounded-2xl blur-3xl" />
                {/* Monitor frame */}
                <div className="relative z-10">
                  <div className="w-full max-w-[320px] sm:max-w-[420px] md:max-w-[500px] aspect-video bg-gray-900 rounded-2xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.3)] ring-1 ring-white/10">
                    <div className="w-full h-full rounded-xl overflow-hidden bg-white">
                      <img
                        src={mappingFeatureImg}
                        alt="Tree inventory desktop dashboard preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  {/* Stand */}
                  <div className="mx-auto w-24 h-6 bg-gradient-to-b from-gray-800 to-gray-900 rounded-b-md shadow-inner" />
                  <div className="mx-auto w-36 h-2 bg-gray-700 rounded-b-lg shadow-xl" />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          COLLECTIVE EFFORT & GLOBAL ALIGNMENT
          ═══════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50 overflow-hidden relative">
        <div className="max-w-4xl mx-auto text-center z-10 relative">
          
          <FadeIn>
            <h2 className="text-[3rem] sm:text-[4rem] md:text-[5rem] font-extrabold text-green-800 tracking-tight leading-none mb-1">
              Collective Effort &
            </h2>
            <h2 className="text-[3rem] sm:text-[4rem] md:text-[5rem] font-black text-gray-900 tracking-tight leading-none mb-12">
              Global Alignment
            </h2>
          </FadeIn>

          <FadeIn delay={200}>
            {/* Primary Partner Logos (PGL, PGENRO, LSPU) */}
            <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-16 mb-12">
              {PARTNERS.map((partner) => (
                <LogoLink key={partner.name} href={partner.href} name={partner.name}>
                  <img
                    src={partner.logo}
                    alt={`${partner.name} logo`}
                    className="w-28 sm:w-36 h-28 sm:h-36 object-contain hover:scale-105 transition-transform duration-300 drop-shadow-md"
                  />
                </LogoLink>
              ))}
            </div>
            
            {/* The Text Block */}
            <div className="bg-gray-50 rounded-3xl p-8 sm:p-10 shadow-sm border border-gray-100 mb-12">
              <p className="text-gray-700 leading-relaxed text-base sm:text-lg text-left sm:text-justify">
                Greenhouse gas emissions are no longer just abstract numbers—we can now track and manage them. As a robust Decision Support System, Green Tag empowers LGUs to shape their Forest Land Use Plans (FLUP), Urban Biodiversity Index, and Local Climate Change Action Plans by calculating carbon stock and sequestration potential. The platform identifies verified planting sites approved by the PGENRO Forestry Division and integrates essential data from top agencies: administrative maps from NAMRIA, soil and elevation data from BSWM, climate-adjusted hazard maps from UPRI NOAH, satellite imagery from Copernicus, and CLIRAM data from DOST-PAGASA. This wealth of information ensures our leaders make resilient decisions that strictly comply with the City Biodiversity Index.
              </p>
            </div>

            {/* Agency Logos (Data Sources) */}
            <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-10 opacity-70 hover:opacity-100 transition-opacity duration-500">
              {DATA_SOURCES.map((agency) => (
                <LogoLink key={agency.name} href={agency.href} name={agency.name}>
                  <img
                    src={agency.logo}
                    alt={`${agency.name} logo`}
                    className={`${agency.size} object-contain grayscale hover:grayscale-0 transition-all duration-300`}
                  />
                </LogoLink>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>
      {/* ═══════════════════════════════════════════
          CONTACT US SECTION
          ═══════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          {/* Header & Text Block */}
          <FadeIn className="flex flex-col md:flex-row gap-10 md:gap-16 items-center md:items-start mb-16">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-[4rem] sm:text-[5rem] md:text-[6rem] font-extrabold tracking-tight leading-none">
                <span className="text-green-800">Contact </span>
                <span className="text-gray-900">Us</span>
              </h2>
            </div>
            <div className="flex-1">
              <p className="text-gray-700 leading-relaxed text-base sm:text-lg text-left sm:text-justify md:text-left">
                Have questions or want to get involved with the Green Tag system? We would love to hear from you. Write to PGENRO or to your own city or municipality&apos;s environment office right here on the site, and they will reply to you by email. Let&apos;s grow a greener Laguna together!
              </p>
            </div>
          </FadeIn>

          {/* Each office's contact details, then the form that writes to one of them */}
          <OfficeDirectory />
          <FadeIn delay={200}>
            <div className="bg-[#DCE1E3] p-6 sm:p-10 rounded-3xl shadow-inner">
              <ContactForm />
            </div>
          </FadeIn>
        </div>
      </section>
    </div>
  );
}
