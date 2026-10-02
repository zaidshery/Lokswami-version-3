import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import DesktopNav from '@/components/layout/DesktopNav';
import MobileNewsNavigation from '@/components/layout/MobileNewsNavigation';
import { HOMEPAGE_NAVIGATION, isReaderNavigationItemActive } from '@/lib/constants/readerNavigation';
import { resolveNewsCategory, NEWS_CATEGORIES, NEWS_CATEGORY_DEFINITIONS } from '@/lib/constants/newsCategories';
const state = vi.hoisted(() => ({ pathname: '/main', language: 'en' }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/store/appStore', () => ({ useAppStore: () => ({ language: state.language }) }));

describe('shared homepage hierarchy', () => {
  beforeEach(() => { state.pathname = '/main'; state.language = 'en'; });
  it.each([320,355,375,390,430,600,768,820,900,1024])('renders all shared top-level items in order at %ipx', width => {
    window.innerWidth = width;
    render(<DesktopNav />);
    const items = Array.from(screen.getByRole('navigation').children);
    expect(items.map(item => item.textContent)).toEqual(HOMEPAGE_NAVIGATION.map(item => item.nameEn));
    expect(items).toHaveLength(15);
    for (const item of items) expect(item.className).not.toMatch(/hidden/);
  });
  it.each(['States','More'])('toggles %s open and closed on repeated taps', name => {
    render(<DesktopNav />);
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    const other = screen.getByRole('button', { name: name === 'States' ? 'More' : 'States' });
    fireEvent.click(other);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(other).toHaveAttribute('aria-expanded', 'true');
  });
  it('closes the strip dropdown after selecting a child or changing routes', () => {
    const { rerender } = render(<DesktopNav />);
    const states = screen.getByRole('button', { name: 'States' });
    fireEvent.click(states);
    fireEvent.click(screen.getByRole('link', { name: 'Madhya Pradesh' }));
    expect(states).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(states);
    state.pathname = '/main/category/business';
    rerender(<DesktopNav />);
    expect(states).toHaveAttribute('aria-expanded', 'false');
  });
  it('restores Hindi spacing when language changes without changing type size', () => {
    const { rerender } = render(<DesktopNav />);
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home.className).toContain('xl:px-[7px]');
    expect(home.className).toContain('xl:text-[14.5px]');
    state.language = 'hi';
    rerender(<DesktopNav />);
    const hindiHome = screen.getByRole('link', { name: 'होम' });
    expect(hindiHome.className).toContain('xl:px-3.5');
    expect(hindiHome.className).toContain('xl:text-[14.5px]');
    expect(screen.getByRole('navigation').className).toContain('xl:gap-1.5');
  });
  it('reveals the active item when the nav exceeds its scroll viewport', () => {
    state.pathname = '/main/elections';
    render(<DesktopNav />);
    const nav = screen.getByRole('navigation');
    const strip = nav.parentElement!;
    const election = screen.getByRole('link', { name: 'Election' });
    Object.defineProperty(nav, 'scrollWidth', { value: 1500 });
    Object.defineProperty(strip, 'clientWidth', { value: 600 });
    strip.getBoundingClientRect = () => ({ left: 0, right: 600 } as DOMRect);
    election.getBoundingClientRect = () => ({ left: 1400, right: 1480, width: 80 } as DOMRect);
    fireEvent(window, new Event('resize'));
    expect(strip.scrollLeft).toBe(884);
  });
  it('preserves exact main labels, supported links and independent publications', () => {
    expect(HOMEPAGE_NAVIGATION.map(item => item.nameEn)).toEqual(['Home','States','Video','E-Paper','E-Magazine','Lokswami Special','Politics','National','International','Sports','Entertainment','Tech','Business','Election','More']);
    expect(HOMEPAGE_NAVIGATION.find(item => item.id === 'regional')?.children?.map(child => [child.nameEn, child.href])).toEqual([
      ['Madhya Pradesh','/main/category/madhya-pradesh'], ['Maharashtra','/main/category/maharashtra'],
      ['Rajasthan','/main/category/rajasthan'], ['Uttar Pradesh','/main/category/uttar-pradesh'], ['Gujarat','/main/category/gujarat'],
    ]);
    expect(HOMEPAGE_NAVIGATION.find(item => item.id === 'more')?.children?.map(item => [item.nameEn,item.href])).toEqual([
      ['Kisaan','/main/category/kisaan'],['Jobs','/main/category/jobs'],
      ['Sarkari Yojana','/main/category/sarkari-yojana'],['Dharm & Jyotish','/main/category/dharm-jyotish'],
      ['Contact','/main/contact'],
    ]);
    expect(HOMEPAGE_NAVIGATION.find(item => item.nameEn === 'E-Paper')?.href).toBe('/main/epaper');
    expect(HOMEPAGE_NAVIGATION.find(item => item.nameEn === 'E-Magazine')?.href).toBe('/main/e-magazine');
    expect(existsSync(path.join(process.cwd(), 'app/(reader)/main/latest/page.tsx'))).toBe(true);
    expect(existsSync(path.join(process.cwd(), 'app/(reader)/main/digital-newsroom/page.tsx'))).toBe(true);
    expect(HOMEPAGE_NAVIGATION.flatMap(item => item.children || []).some(child => child.href === '/main/digital-newsroom')).toBe(false);
  });
  it('maps CMS names and aliases without expanding the primary homepage rails', () => {
    for (const alias of ['MP','Madhya Pradesh','madhya-pradesh','मध्य प्रदेश']) expect(resolveNewsCategory(alias)?.slug).toBe('madhya-pradesh');
    expect(NEWS_CATEGORIES).toHaveLength(9);
    expect(resolveNewsCategory('अपराध')?.slug).toBe('crime');
    expect(NEWS_CATEGORY_DEFINITIONS.some(item => item.slug === 'madhya-pradesh')).toBe(true);
  });
  it.each(['madhya-pradesh','maharashtra','rajasthan','uttar-pradesh','gujarat'].map(slug => `/main/category/${slug}`))('activates States alone for %s', pathname => {
    expect(HOMEPAGE_NAVIGATION.filter(item => isReaderNavigationItemActive(pathname,item)).map(item => item.nameEn)).toEqual(['States']);
  });
  it('activates More alone on supported utility routes', () => {
    expect(HOMEPAGE_NAVIGATION.filter(item => isReaderNavigationItemActive('/main/contact',item)).map(item => item.nameEn)).toEqual(['More']);
    for (const slug of ['kisaan','jobs','sarkari-yojana','dharm-jyotish'])
      expect(HOMEPAGE_NAVIGATION.filter(item => isReaderNavigationItemActive(`/main/category/${slug}`,item)).map(item => item.nameEn)).toEqual(['More']);
  });
  it('opens one desktop group, marks the active child, and restores focus on Escape', () => {
    state.pathname = '/main/category/madhya-pradesh';
    render(<DesktopNav />);
    const regional = screen.getByRole('button',{name:'States'});
    fireEvent.click(regional);
    expect(regional).toHaveAttribute('aria-expanded','true');
    expect(regional).toHaveAttribute('aria-controls','reader-dropdown-regional');
    expect(screen.getByRole('link',{name:'Madhya Pradesh'})).toHaveAttribute('aria-current','page');
    fireEvent.click(screen.getByRole('button',{name:'More'}));
    expect(screen.queryByRole('link',{name:'Madhya Pradesh'})).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Kisaan'})).toHaveAttribute('href','/main/category/kisaan');
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.getByRole('button',{name:'More'})).toHaveFocus();
    expect(screen.queryByRole('link',{name:'Kisaan'})).not.toBeInTheDocument();
  });
  it('closes desktop groups on outside click', () => {
    render(<DesktopNav />);
    fireEvent.click(screen.getByRole('button',{name:'States'}));
    expect(screen.getByRole('link',{name:'Madhya Pradesh'})).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('link',{name:'Madhya Pradesh'})).not.toBeInTheDocument();
  });
  it('provides collapsed accessible mobile accordions and closes on navigation', () => {
    const close = vi.fn();
    render(<MobileNewsNavigation language="en" onNavigate={close} />);
    const nav=within(screen.getByRole('navigation',{name:'News navigation'}));
    const regional=nav.getByRole('button',{name:'States'});
    expect(regional).toHaveAttribute('aria-expanded','false');
    expect(nav.queryByRole('link',{name:'Madhya Pradesh'})).not.toBeInTheDocument();
    fireEvent.click(regional);
    fireEvent.click(nav.getByRole('link',{name:'Madhya Pradesh'}));
    expect(close).toHaveBeenCalledOnce();
    fireEvent.click(nav.getByRole('button',{name:'More'}));
    expect(regional).toHaveAttribute('aria-expanded','false');
    expect(nav.getByRole('button',{name:'More'})).toHaveAttribute('aria-expanded','true');
    expect(['Kisaan','Jobs','Sarkari Yojana','Dharm & Jyotish','Contact'].map(name => nav.getByRole('link',{name}).textContent)).toEqual(['Kisaan','Jobs','Sarkari Yojana','Dharm & Jyotish','Contact']);
    expect(nav.queryByRole('link',{name:'Latest News'})).not.toBeInTheDocument();
    expect(nav.getByRole('link',{name:'Contact'})).toHaveAttribute('href','/main/contact');
    fireEvent.click(nav.getByRole('button',{name:'More'}));
    expect(nav.getByRole('button',{name:'More'})).toHaveAttribute('aria-expanded','false');
  });
  it('uses shared Hindi labels and highlights the selected More child', () => {
    state.pathname='/main/category/dharm-jyotish';state.language='hi';
    render(<DesktopNav />);
    const more=screen.getByRole('button',{name:HOMEPAGE_NAVIGATION.find(item=>item.id==='more')!.name});
    expect(more).toHaveAttribute('data-nav-active','true');
    fireEvent.click(more);
    expect(screen.getByRole('link',{name:'धर्म एवं ज्योतिष'})).toHaveAttribute('aria-current','page');
  });
});
