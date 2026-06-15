"use client";

import "@/components/legacy-laptrinhrobot/_styles/legacy.css";

import TopCountdownBar from "@/components/legacy-laptrinhrobot/TopCountdownBar";
import Header from "@/components/legacy-laptrinhrobot/Header";
import Hero from "@/components/legacy-laptrinhrobot/Hero";
import ContestInfo from "@/components/legacy-laptrinhrobot/ContestInfo";
import SpecialOfferCountdown from "@/components/legacy-laptrinhrobot/SpecialOfferCountdown";
import Roadmap5Years from "@/components/legacy-laptrinhrobot/Roadmap5Years";
import TeachingMethod from "@/components/legacy-laptrinhrobot/TeachingMethod";
import Locations from "@/components/legacy-laptrinhrobot/Locations";
import Commitment from "@/components/legacy-laptrinhrobot/Commitment";
import Gifts from "@/components/legacy-laptrinhrobot/Gifts";
import InternalAwards from "@/components/legacy-laptrinhrobot/InternalAwards";
import Testimonials from "@/components/legacy-laptrinhrobot/Testimonials";
import RegistrationForm from "@/components/legacy-laptrinhrobot/RegistrationForm";
import FAQ from "@/components/legacy-laptrinhrobot/FAQ";
import FinalCTA from "@/components/legacy-laptrinhrobot/FinalCTA";
import Footer from "@/components/legacy-laptrinhrobot/Footer";
import FloatingCTA from "@/components/legacy-laptrinhrobot/FloatingCTA";
import AgeCoursePopup from "@/components/legacy-laptrinhrobot/AgeCoursePopup";
import type { Promotions } from "@/components/legacy-laptrinhrobot/_data/promotions";

export default function LapTrinhRobotClient({ promotions }: { promotions?: Promotions }) {
  return (
    <>
      <div className="fixed left-0 right-0 top-0 z-[100] isolate">
        <div className="relative z-0">
          <TopCountdownBar />
        </div>
        <div className="relative z-10">
          <Header />
        </div>
      </div>

      <main className="pt-[104px] sm:pt-[118px]">
        <Hero />
        <ContestInfo />
        <Roadmap5Years />
        <SpecialOfferCountdown promotions={promotions} />
        <TeachingMethod />
        <Locations />
        <Commitment />
        <Gifts />
        <InternalAwards />
        <Testimonials />
        <RegistrationForm />
        <FAQ />
        <FinalCTA />
      </main>

      <Footer />
      <FloatingCTA />
      <AgeCoursePopup />
    </>
  );
}
