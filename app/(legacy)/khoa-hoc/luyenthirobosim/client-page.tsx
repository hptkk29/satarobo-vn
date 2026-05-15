"use client";

import "@/components/legacy-luyenthirobosim/_styles/legacy.css";

import TopCountdownBar from "@/components/legacy-luyenthirobosim/TopCountdownBar";
import Header from "@/components/legacy-luyenthirobosim/Header";
import Hero from "@/components/legacy-luyenthirobosim/Hero";
import ContestInfo from "@/components/legacy-luyenthirobosim/ContestInfo";
import Pain from "@/components/legacy-luyenthirobosim/Pain";
import HowToBuy from "@/components/legacy-luyenthirobosim/HowToBuy";
import Results from "@/components/legacy-luyenthirobosim/Results";
import Solution from "@/components/legacy-luyenthirobosim/Solution";
import Courses from "@/components/legacy-luyenthirobosim/Courses";
import Roadmap from "@/components/legacy-luyenthirobosim/Roadmap";
import Testimonials from "@/components/legacy-luyenthirobosim/Testimonials";
import FinalCTA from "@/components/legacy-luyenthirobosim/FinalCTA";
import FAQ from "@/components/legacy-luyenthirobosim/FAQ";
import Footer from "@/components/legacy-luyenthirobosim/Footer";
import FloatingButtons from "@/components/legacy-luyenthirobosim/FloatingButtons";
import ExitIntentPopup from "@/components/legacy-luyenthirobosim/ExitIntentPopup";

export default function LuyenThiRobosimClient() {
  return (
    <>
      <TopCountdownBar />
      <Header />
      <main id="main-content">
        <Hero />
        <ContestInfo />
        <Pain />
        <HowToBuy />
        <Results />
        <Solution />
        <Courses />
        <Roadmap />
        <Testimonials />
        <FinalCTA />
        <FAQ />
      </main>
      <Footer />
      <FloatingButtons />
      <ExitIntentPopup />
    </>
  );
}
