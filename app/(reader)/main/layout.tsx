'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store/appStore';
import Header from '@/components/layout/Header';
import BottomNav from '@/components/layout/BottomNav';
import MobileMenu from '@/components/layout/MobileMenu';
import Footer from '@/components/layout/Footer';
import SigninRoleBanner from '@/components/auth/SigninRoleBanner';
import BreakingNews from '@/components/ui/BreakingNews';
import Container from '@/components/layout/Container';
import DailyEpaperAlert from '@/components/ui/DailyEpaperAlert';
import PopupOrchestrator from '@/components/ui/PopupOrchestrator';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === '/main/elections') {
    return (
      <Suspense fallback={<MainLayoutContent pathname={pathname} isElectionObsMode={false}>{children}</MainLayoutContent>}>
        <ElectionMainLayout pathname={pathname}>{children}</ElectionMainLayout>
      </Suspense>
    );
  }

  return <MainLayoutContent pathname={pathname} isElectionObsMode={false}>{children}</MainLayoutContent>;
}

function ElectionMainLayout({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const searchParams = useSearchParams();
  return (
    <MainLayoutContent pathname={pathname} isElectionObsMode={searchParams.get('obs') === '1'}>
      {children}
    </MainLayoutContent>
  );
}

function MainLayoutContent({
  children,
  pathname,
  isElectionObsMode,
}: {
  children: React.ReactNode;
  pathname: string;
  isElectionObsMode: boolean;
}) {
  const {
    setIsMobile,
    setIsTablet,
    toggleMobileMenu,
    isMobileMenuOpen,
    setMobileMenuOpen,
    isImmersiveVideoMode,
    isEpaperReaderOpen,
  } = useAppStore();
  const isVideosRoute = pathname?.startsWith('/main/videos') ?? false;
  const isSwipeRoute = pathname?.startsWith('/main/shorts/') ?? false;
  const isEpaperRoute =
    pathname?.startsWith('/main/epaper') || pathname?.startsWith('/main/e-magazine') || false;
  const isReaderImmersiveMode = isEpaperRoute && isEpaperReaderOpen;
  const isFullscreenReader = isSwipeRoute || isImmersiveVideoMode || isReaderImmersiveMode || isElectionObsMode;
  const showBottomNav =
    (!isImmersiveVideoMode || isVideosRoute || isSwipeRoute) &&
    !isReaderImmersiveMode &&
    !isElectionObsMode;


  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, [setIsMobile, setIsTablet]);

  return (
    <div className="min-h-screen overflow-x-clip bg-white transition-colors duration-500 dark:bg-[#0e0e12]">
      {/* Accessible Skip Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-editorial-md focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white focus:shadow-editorial-md focus:outline-none focus:ring-2 focus:ring-white"
      >
        मुख्य सामग्री पर जाएं / Skip to main content
      </a>

      {/* Unified Sticky Shell Container (Breaking News + Header stack naturally) */}
      {!isFullscreenReader ? (
        <div className="sticky top-0 z-40 w-full">
          <BreakingNews />
          <Header />
        </div>
      ) : null}

      {/* Mobile Menu Drawer */}
      {!isElectionObsMode && !isSwipeRoute ? <MobileMenu isOpen={isMobileMenuOpen} onClose={() => setMobileMenuOpen(false)} /> : null}

      <main
        id="main-content"
        tabIndex={-1}
        role="main"
        className={
          isElectionObsMode || isSwipeRoute
            ? 'pb-0 pt-0'
            : isImmersiveVideoMode
              ? 'pb-0 pt-0'
              : isReaderImmersiveMode
                ? 'pb-0 pt-0'
                : isVideosRoute
                  ? 'xl:pb-4'
                  : 'reader-bottom-safe-pad xl:pb-4'
        }
      >
        {!isFullscreenReader ? <SigninRoleBanner /> : null}
        <Container
          className={
            isElectionObsMode || isSwipeRoute
              ? 'py-0 !max-w-none !px-0'
              : isImmersiveVideoMode
              ? 'py-0 !max-w-none !px-0'
              : isReaderImmersiveMode
                ? 'py-0 !max-w-none !px-0'
                : 'py-4 md:py-5 !px-3 sm:!px-5 lg:!px-6'
          }
        >
          {children}
        </Container>
      </main>

      {/* Footer */}
      {!isFullscreenReader ? (
        <div className="block">
          <Footer />
        </div>
      ) : null}

      {!isFullscreenReader ? <DailyEpaperAlert /> : null}
      {!isFullscreenReader ? <PopupOrchestrator /> : null}

      {/* Bottom Navigation - Mobile + Tablet (below 1280px) */}
      {showBottomNav ? (
        <BottomNav
          onMenuClick={toggleMobileMenu}
          isMenuOpen={isMobileMenuOpen}
          isOverlayDark={(isImmersiveVideoMode && isVideosRoute) || isSwipeRoute}
        />
      ) : null}
    </div>
  );
}
