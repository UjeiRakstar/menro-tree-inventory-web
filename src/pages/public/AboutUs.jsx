import { useEffect, useRef, useState } from 'react';
import { Leaf } from 'lucide-react';

import aerialImg from '../../assets/Aerial.jpg';
import desktopImg from '../../assets/desktop.PNG';
import forestcoverImg from '../../assets/forestcover.avif';
import mobileImg from '../../assets/Mobile.jpg';
import sdg9Img from '../../assets/SDG9.png';
import sdg11Img from '../../assets/SDG11.png';
import sdg13Img from '../../assets/SDG13.png';
import sdg15Img from '../../assets/SDG15.png';

/* ─── Scroll-triggered fade-in hook ─── */
function useFadeIn(options = {}) {
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
      { threshold: 0.15, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/* ─── Reusable fade wrapper ─── */
function FadeIn({ children, delay = 0, className = '' }) {
  const { ref, visible } = useFadeIn();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── SDG Card with staggered animation ─── */
function SdgCard({ image, altText, description, delay }) {
  const { ref, visible } = useFadeIn();
  return (
    <div ref={ref} className="flex flex-col items-center">
      {/* Card tile - fades up */}
      <div
        className={`w-full max-w-[180px] rounded-lg overflow-hidden mb-4 transition-all duration-700 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
        style={{ transitionDelay: `${delay}ms` }}
      >
        <img src={image} alt={altText} className="w-full h-auto object-cover" />
      </div>
      {/* Description - appears after all tiles */}
      <div
        className={`bg-yellow-500 text-white text-xs sm:text-sm font-medium px-4 py-2 rounded-md w-full max-w-[180px] text-center transition-all duration-700 ease-out ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
        style={{ transitionDelay: `${delay + 600}ms` }}
      >
        {description}
      </div>
    </div>
  );
}

export default function AboutUs() {
  return (
    <div className="bg-white min-h-screen">
      {/* ═══ Section 1: Project Green Tag ═══ */}
      <section className="min-h-screen flex items-center py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center">
            {/* Left: Text content */}
            <FadeIn className="flex-1 order-2 md:order-1">
              <div className="flex items-start sm:items-center gap-3 mb-6 flex-wrap">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-light text-gray-800 uppercase">
                  Project
                </h2>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-green-700 uppercase">
                  Green Tag
                </h2>
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-700 rounded-md rotate-45 flex items-center justify-center flex-shrink-0">
                  <Leaf className="text-white -rotate-45" size={20} />
                </div>
              </div>

              <p className="text-gray-700 leading-relaxed mb-5 text-sm sm:text-base text-justify">
                The Santa Cruz Tree Inventory System represents a transformative digital leap for
                urban forestry management in the Municipality of Santa Cruz, Laguna. Developed in
                partnership with the Municipal Environment and Natural Resources Office (MENRO),
                this platform harnesses modern geospatial technology to catalog, monitor, and
                protect every tree within our jurisdiction — from century-old narra along the
                national highway to newly planted seedlings in our barangay parks.
              </p>
              <p className="text-gray-700 leading-relaxed text-sm sm:text-base text-justify">
                By tracking biodiversity indices, estimating carbon sequestration capacity, and
                mapping canopy coverage in real time, the system empowers local decision-makers
                with the evidence they need to build a greener, more resilient municipality. It
                transforms what was once a paper-based process into a living, breathing digital
                ecosystem — one that grows alongside the very trees it protects.
              </p>
            </FadeIn>

            {/* Right: Image */}
            <FadeIn delay={300} className="flex-1 order-1 md:order-2 w-full">
              <div className="w-full h-64 sm:h-80 md:h-96 rounded-lg overflow-hidden shadow-lg">
                <img
                  src={aerialImg}
                  alt="Aerial view of Santa Cruz forest canopy"
                  className="w-full h-full object-cover"
                />
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══ Section 2: SDGs ═══ */}
      <section className="min-h-screen flex items-center py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-6xl mx-auto text-center w-full">
          <FadeIn>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 uppercase tracking-wide mb-12">
              For a Greener, Better, Sustainable Laguna
            </h2>
          </FadeIn>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            <SdgCard
              image={sdg9Img}
              altText="SDG 9 - Industry, Innovation and Infrastructure"
              delay={0}
              description="Digital tools and smart infrastructure enable precise tree monitoring across the municipality."
            />
            <SdgCard
              image={sdg11Img}
              altText="SDG 11 - Sustainable Cities and Communities"
              delay={200}
              description="Mapping urban green spaces builds safer, more livable communities for every barangay."
            />
            <SdgCard
              image={sdg13Img}
              altText="SDG 13 - Climate Action"
              delay={400}
              description="Carbon sequestration data turns every tree into a measurable climate action asset."
            />
            <SdgCard
              image={sdg15Img}
              altText="SDG 15 - Life on Land"
              delay={600}
              description="Cataloging native species protects terrestrial biodiversity and flags at-risk trees."
            />
          </div>
        </div>
      </section>

      {/* ═══ Section 3: Crowdsourcing - "Pagbabago ng Klima, Kaya ng Laguna" ═══ */}
      <section className="min-h-screen flex items-center py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-yellow-50/50">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center">
            {/* Left: Phone mockup */}
            <FadeIn className="flex-1 flex justify-center">
              <div className="relative">
                <div className="w-56 sm:w-64 h-[420px] sm:h-[480px] bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl">
                  <div className="w-full h-full rounded-[2rem] overflow-hidden">
                    <img
                      src={mobileImg}
                      alt="Tree inventory mobile app preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="absolute -bottom-4 -left-6 w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <Leaf className="text-white" size={20} />
                </div>
              </div>
            </FadeIn>

            {/* Right: Content */}
            <FadeIn delay={200} className="flex-1">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-light text-gray-700 uppercase italic mb-1">
                Pagbabago ng Klima
              </h2>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 uppercase mb-8">
                Kaya ng Laguna
              </h2>

              {/* Crowdsourcing */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Crowdsourcing
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  Environmental stewardship belongs to all of us. Spot a remarkable tree in your
                  neighborhood — a towering acacia or a flowering molave — and help document it.
                  Tag its GPS location, snap a photo, and submit through our public portal. Trained
                  MENRO Arborists verify every submission and add it to the official inventory.
                </p>
              </div>

              {/* Data Collection */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Data Collection
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  Every verified tree submission strengthens our collective understanding of Santa
                  Cruz's urban forest. Species identification, health assessments, and geolocation
                  data flow into a centralized system that powers real-time environmental
                  decision-making for the entire municipality.
                </p>
              </div>

              {/* Fun and Simple */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Fun and Simple
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  No technical expertise required. Open the app on your smartphone, point your
                  camera at a tree, and let the system guide you through the rest. It takes less
                  than two minutes to make a meaningful contribution to your community's green
                  future.
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══ Section 4: "We Cannot Plan What We Can't Measure" ═══ */}
      <section className="min-h-screen flex items-center py-12 sm:py-16 px-4 sm:px-6 lg:px-8 bg-yellow-50/30">
        <div className="max-w-6xl mx-auto w-full">
          <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center">
            {/* Left: Content */}
            <FadeIn className="flex-1">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-light text-gray-800 uppercase mb-1">
                We Cannot Plan
              </h2>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 uppercase mb-8">
                What We Can&apos;t Measure
              </h2>

              {/* Urban Tree Biodiversity */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Urban Tree Biodiversity
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  The system catalogs every species across all barangays — native, endemic, and
                  introduced — creating a comprehensive biodiversity index that reveals ecological
                  strengths and vulnerabilities across the municipality's landscape.
                </p>
              </div>

              {/* Carbon Sequestration Potential */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Carbon Sequestration Potential
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  Each inventoried tree is assessed for its carbon absorption capacity based on
                  species, diameter, and canopy size. This data quantifies Santa Cruz's natural
                  climate mitigation assets and informs reforestation priorities.
                </p>
              </div>

              {/* Hazard Tree Mapping */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Leaf className="text-green-700 flex-shrink-0" size={20} />
                  <h3 className="font-bold text-gray-800 uppercase text-sm sm:text-base">
                    Hazard Tree Mapping
                  </h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed ml-8">
                  Trees with structural defects, disease, or proximity to power lines and
                  structures are flagged for priority action. When typhoon season arrives, disaster
                  risk reduction officers know exactly which trees require preemptive intervention.
                </p>
              </div>
            </FadeIn>

            {/* Right: Monitor mockup */}
            <FadeIn delay={300} className="flex-1 flex justify-center">
              <div className="relative">
                <div className="w-72 sm:w-80 md:w-96 h-52 sm:h-60 md:h-64 bg-gray-900 rounded-lg p-2 shadow-2xl">
                  <div className="w-full h-full rounded overflow-hidden">
                    <img
                      src={desktopImg}
                      alt="Tree inventory desktop dashboard preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="mx-auto w-16 h-4 bg-gray-800 rounded-b-md"></div>
                <div className="mx-auto w-24 h-2 bg-gray-700 rounded-b-lg"></div>
                <div className="absolute -top-4 -right-4">
                  <Leaf className="text-green-600 rotate-45" size={32} />
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ═══ Section 5: Thank You ═══ */}
      <section className="relative min-h-screen flex items-center py-20 sm:py-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* Background - forest cover image */}
        <div className="absolute inset-0">
          <img
            src={forestcoverImg}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-green-900/60"></div>
        </div>
        <div className="absolute top-0 left-0 right-0 h-2 bg-green-600"></div>

        <FadeIn className="relative max-w-3xl mx-auto text-center w-full">
          <div className="mb-6">
            <Leaf className="mx-auto text-green-300" size={36} />
          </div>

          <div className="border-2 border-green-400/60 inline-block px-8 sm:px-16 py-4 sm:py-6 mb-8">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white uppercase tracking-wider">
              Thank You
            </h2>
          </div>

          <p className="text-green-100 leading-relaxed mb-4 text-sm sm:text-base max-w-2xl mx-auto">
            To the citizens of Santa Cruz — thank you for your curiosity, your vigilance, and
            your love for the environment. Every tree you report, every photo you upload, and
            every conversation you start about our urban forest brings us closer to a
            sustainable future.
          </p>
          <p className="text-green-100 leading-relaxed mb-4 text-sm sm:text-base max-w-2xl mx-auto">
            To the Local Government Unit of Santa Cruz, Laguna — thank you for championing
            innovation in environmental governance and for trusting that technology can serve
            both people and nature.
          </p>
          <p className="text-green-100 leading-relaxed text-sm sm:text-base max-w-2xl mx-auto">
            To the proponents and developers of this system — thank you for translating vision
            into reality. Together, we are building not just a database, but a legacy of
            stewardship for generations to come.
          </p>

          <div className="mt-10 pt-6 border-t border-green-500/40">
            <p className="text-sm text-green-300">
              Municipal Environment and Natural Resources Office (MENRO)
              <br />
              Municipality of Santa Cruz, Province of Laguna
            </p>
          </div>
        </FadeIn>
      </section>
    </div>
  );
}
