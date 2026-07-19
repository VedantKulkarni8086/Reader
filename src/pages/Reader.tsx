import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Minimize,
  Palette,
  Search,
  List,
  Bookmark,
  MoreVertical,
  X,
  Type
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTheme } from "../components/ThemeProvider";

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function ReaderPage() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  
  // UI States
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  
  // Kindle Mode States
  const [viewMode, setViewMode] = useState<"text" | "pdf">("text");
  const [fontFamily, setFontFamily] = useState<"font-serif" | "font-sans" | "font-dyslexic">("font-serif");
  const [pageLayout, setPageLayout] = useState<"single" | "two">("single");
  const [pageMargin, setPageMargin] = useState<"narrow" | "medium" | "wide">("medium");
  
  // Text Extraction
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isExtracting, setIsExtracting] = useState(false);
  
  // Reading Speed States
  const [wpmHistory, setWpmHistory] = useState<number[]>([]);
  const pageStartTime = useRef<number>(Date.now());
  const currentPageWordCount = useRef<number>(0);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const tocRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
      
      const target = event.target as Element;
      // Close TOC if clicking outside TOC AND not clicking the TOC toggle button
      if (tocRef.current && !tocRef.current.contains(target) && !target.closest('#toc-toggle-btn')) {
        setIsTocOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Persistence
  useEffect(() => {
    const savedWpm = localStorage.getItem('pdf-wpm');
    if (savedWpm) {
      try { setWpmHistory(JSON.parse(savedWpm)); } catch (e) {}
    }
    
    if (file) {
      const savedPage = localStorage.getItem(`pdf-progress-${file.name}`);
      if (savedPage) setPageNumber(parseInt(savedPage, 10));
      else setPageNumber(1);
    }
  }, [file]);

  useEffect(() => {
    if (file && pageNumber > 0) {
      localStorage.setItem(`pdf-progress-${file.name}`, pageNumber.toString());
    }
  }, [pageNumber, file]);

  // Extract Text when page changes and in text mode
  useEffect(() => {
    const extractPageText = async () => {
      if (!pdfDocument || viewMode !== "text") return;
      setIsExtracting(true);
      try {
        const page = await pdfDocument.getPage(pageNumber);
        const textContent = await page.getTextContent();
        
        let paragraphs: string[] = [];
        let currentParagraph = "";
        let lastY = -1;
        
        // Intelligent reflow extraction
        for (const item of textContent.items) {
          if (lastY !== -1) {
             const yDiff = Math.abs(item.transform[5] - lastY);
             if (yDiff > 20) { 
               if (currentParagraph.trim()) paragraphs.push(currentParagraph.trim());
               currentParagraph = "";
             } else if (yDiff > 4) {
               if (!currentParagraph.endsWith(" ") && !currentParagraph.endsWith("-")) {
                 currentParagraph += " ";
               }
             }
          }
          currentParagraph += item.str;
          if (item.hasEOL && !currentParagraph.endsWith(" ")) {
             currentParagraph += " ";
          }
          lastY = item.transform[5];
        }
        if (currentParagraph.trim()) paragraphs.push(currentParagraph.trim());
        
        const fullExtracted = paragraphs.join('\n\n');
        setExtractedText(fullExtracted);
        
        const words = fullExtracted.trim().split(/\s+/).length;
        const now = Date.now();
        const timeSpentMinutes = (now - pageStartTime.current) / 60000;
        
        if (currentPageWordCount.current > 20 && timeSpentMinutes > (5/60) && timeSpentMinutes < 10) {
           const wpm = Math.round(currentPageWordCount.current / timeSpentMinutes);
           setWpmHistory(prev => {
             const newHistory = [...prev, wpm].slice(-15);
             localStorage.setItem('pdf-wpm', JSON.stringify(newHistory));
             return newHistory;
           });
        }
        
        currentPageWordCount.current = words;
        pageStartTime.current = now;
      } catch (err) {
        console.error("Failed to extract text:", err);
        setExtractedText("Failed to extract text for this page. It might be an image-only PDF.");
      } finally {
        setIsExtracting(false);
      }
    };
    
    extractPageText();
  }, [pdfDocument, pageNumber, viewMode]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (files && files[0]) {
      setFile(files[0]);
    }
  }

  function onDocumentLoadSuccess(pdf: any) {
    setNumPages(pdf.numPages);
    setPdfDocument(pdf);
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  if (!file) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center p-6 min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans">
        <div className="absolute top-6 left-6">
          <Link to="/" className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity font-medium">
            <X className="w-5 h-5" /> Back to Home
          </Link>
        </div>
        
        <div className="w-full max-w-md p-10 rounded-2xl bg-black/5 border border-[var(--foreground)] border-opacity-10 flex flex-col items-center text-center space-y-8 shadow-sm">
          <div className="p-4 bg-[#00AEEF] text-white border-transparent rounded-full opacity-70">
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-medium font-serif">Open a Document</h2>
            <p className="opacity-70 text-sm">Select a PDF file to begin reading</p>
          </div>
          
          <label className="w-full py-3 px-6 bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 rounded-lg font-medium cursor-pointer transition-colors shadow-sm">
            Choose PDF File
            <input 
              type="file" 
              accept=".pdf" 
              onChange={onFileChange} 
              className="hidden" 
            />
          </label>
        </div>
      </main>
    );
  }

  const themes = [
    { id: "light", label: "Light", swatch: "#ffffff" },
    { id: "sepia", label: "Sepia", swatch: "#f4ecd8" },
    { id: "dark", label: "Dark", swatch: "#18181b" },
    { id: "amoled", label: "AMOLED", swatch: "#000000" },
    { id: "warm-night", label: "Warm Night", swatch: "#2b2118" },
    { id: "forest", label: "Forest", swatch: "#1a2e1a" },
    { id: "ocean", label: "Ocean", swatch: "#141e2e" },
    { id: "rose", label: "Rose", swatch: "#2a1a22" },
  ] as const;

  const fontOptions = [
    { id: "font-serif", label: "Bookerly (Serif)" },
    { id: "font-sans", label: "Amazon Ember (Sans)" },
    { id: "font-dyslexic", label: "OpenDyslexic" }
  ] as const;

  const marginMap = {
    narrow: "max-w-5xl",
    medium: "max-w-3xl",
    wide: "max-w-xl"
  };
  // Calculate average WPM
  const averageWpm = wpmHistory.length > 0 
    ? Math.round(wpmHistory.reduce((a, b) => a + b, 0) / wpmHistory.length) 
    : 0;

  let readingSpeedText = "Learning reading speed...";
  if (averageWpm > 0 && currentPageWordCount.current > 0) {
    const minsLeft = Math.ceil(((numPages - pageNumber) * currentPageWordCount.current) / averageWpm);
    readingSpeedText = `${averageWpm} WPM • ~${minsLeft} mins left in book`;
  }

  return (
    <div ref={containerRef} className="flex flex-col h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300 selection:bg-blue-500/30">
      
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 md:px-6 py-3 border-b border-[var(--foreground)] border-opacity-10 z-20 bg-[var(--background)]">
        <div className="flex-1 flex justify-start">
          <button onClick={() => setFile(null)} className="group flex items-center gap-2 px-3 py-1.5 border border-transparent bg-fg-border-light rounded-full hover:bg-[#00AEEF] hover:border-[#00AEEF] hover:text-white transition-colors text-sm font-medium">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)] group-hover:bg-white group-hover:text-[#00AEEF] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </span>
            Upload & Convert to Text
          </button>
        </div>

        <div className="flex-1 hidden md:flex justify-center text-center">
          <span className="font-medium text-sm md:text-base uppercase tracking-wider truncate px-4 opacity-90 font-serif">
            {file.name.replace('.pdf', '')}
          </span>
        </div>

        <div className="flex-1 flex justify-end items-center gap-1 md:gap-3">
          <button 
            id="toc-toggle-btn"
            onClick={(e) => { e.stopPropagation(); setIsTocOpen(!isTocOpen); setIsThemeMenuOpen(false); }}
            className={`p-2 rounded-lg transition-colors ${isTocOpen ? 'bg-[#00AEEF] text-white' : 'bg-fg-border-light hover:bg-[#00AEEF] hover:text-white'}`}
            title="Table of Contents"
          >
            <List className="w-5 h-5 opacity-80" />
          </button>
          
          <button className="p-2 rounded-lg bg-fg-border-light hover:bg-[#00AEEF] hover:text-white transition-colors hidden sm:block">
            <Search className="w-5 h-5 opacity-80" />
          </button>

          {/* Aa Appearance Menu */}
          <div className="relative" ref={themeMenuRef}>
            <button 
              onClick={() => { setIsThemeMenuOpen(!isThemeMenuOpen); setIsTocOpen(false); }}
              className={`p-2 rounded-lg transition-colors ${isThemeMenuOpen ? 'bg-[#00AEEF] text-white' : 'bg-fg-border-light hover:bg-[#00AEEF] hover:text-white'}`}
              title="Appearance"
            >
              <span className="text-lg leading-none">Aa</span>
            </button>
            
            {isThemeMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-[320px] bg-[var(--background)] border border-[var(--foreground)] border-opacity-10 rounded-xl shadow-2xl z-50 p-4 max-h-[80vh] overflow-y-auto">
                
                {/* View Mode Toggle */}
                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-3 font-bold">Reader Mode</div>
                  <div className="flex p-1 bg-[var(--foreground)] bg-opacity-5 rounded-lg">
                    <button 
                      onClick={() => setViewMode("text")}
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md flex items-center justify-center gap-2 transition-all ${viewMode === "text" ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'opacity-70'}`}
                    >
                      <Type className="w-4 h-4" /> Kindle Text
                    </button>
                    <button 
                      onClick={() => setViewMode("pdf")}
                      className={`flex-1 py-1.5 text-sm  text-black font-medium rounded-md flex items-center justify-center gap-2 transition-all ${viewMode === "pdf" ? 'bg-[var(--foreground)] text-[var(--background)] shadow-sm' : 'opacity-70'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> Original PDF
                    </button>
                  </div>
                </div>

                {/* Font Family (Only for text mode) */}
                <div className={`mb-6 transition-opacity ${viewMode === "pdf" ? "opacity-30 pointer-events-none" : ""}`}>
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-3 font-bold">Font</div>
                  <div className="space-y-1">
                    {fontOptions.map(f => (
                      <button
                        key={f.id}
                        onClick={() => setFontFamily(f.id)}
                        className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between ${fontFamily === f.id ? 'bg-[#00AEEF] text-white border-transparent font-medium' : 'hover:bg-[#00AEEF] hover:text-white border-transparent'}`}
                      >
                        <span className={f.id}>{f.label}</span>
                        {fontFamily === f.id && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Colour */}
                <div className="mb-6">
                  <div className="text-xs uppercase tracking-wider opacity-50 mb-3 font-bold">Page Colour</div>
                  <div className="grid grid-cols-4 gap-2">
                    {themes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        title={t.label}
                        className={`aspect-square rounded-full flex items-center justify-center border-2 transition-transform ${theme === t.id ? 'border-blue-500 scale-110' : 'border-transparent hover:scale-105'}`}
                        style={{ backgroundColor: t.swatch }}
                      >
                        {theme === t.id && (
                          <div className={`w-3 h-3 rounded-full ${t.id === 'light' || t.id === 'sepia' ? 'bg-black' : 'bg-white'}`}></div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Layout & Margin (Only for text mode) */}
                <div className={`space-y-6 transition-opacity ${viewMode === "pdf" ? "opacity-30 pointer-events-none" : ""}`}>
                  <div>
                    <div className="text-xs uppercase tracking-wider opacity-50 mb-3 font-bold">Layout</div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setPageLayout("single")}
                        className={`flex-1 py-2 border rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${pageLayout === "single" ? 'border-[#00AEEF] bg-[#00AEEF] text-black' : 'border-fg-border-light bg-fg-border-light hover:border-[#00AEEF] opacity-70 hover:opacity-100'}`}
                      >
                        <div className="w-6 h-8 border border-current rounded-sm flex flex-col items-center justify-center p-1 space-y-[2px]">
                          <div className="w-full h-[1px] bg-current"></div>
                          <div className="w-full h-[1px] bg-current"></div>
                          <div className="w-full h-[1px] bg-current"></div>
                        </div>
                        <span className="text-[10px]">Single Column</span>
                      </button>
                      <button 
                        onClick={() => setPageLayout("two")}
                        className={`flex-1 py-2 border rounded-lg flex flex-col items-center justify-center gap-1 transition-colors ${pageLayout === "two" ? 'border-[#00AEEF] bg-[#00AEEF] text-black' : 'border-fg-border-light bg-fg-border-light hover:border-[#00AEEF] opacity-70 hover:opacity-100'}`}
                      >
                        <div className="w-8 h-8 border border-current rounded-sm flex items-center justify-center p-1 gap-1">
                          <div className="flex-1 h-full flex flex-col justify-center space-y-[2px]">
                             <div className="w-full h-[1px] bg-current"></div>
                             <div className="w-full h-[1px] bg-current"></div>
                          </div>
                          <div className="flex-1 h-full flex flex-col justify-center space-y-[2px]">
                             <div className="w-full h-[1px] bg-current"></div>
                             <div className="w-full h-[1px] bg-current"></div>
                          </div>
                        </div>
                        <span className="text-[10px]">Two Columns</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-wider opacity-50 mb-3 font-bold">Margin</div>
                    <div className="flex gap-2">
                      {(["narrow", "medium", "wide"] as const).map(m => (
                        <button 
                          key={m}
                          onClick={() => setPageMargin(m)}
                          className={`flex-1 py-2 text-black text-xs capitalize border rounded-lg transition-colors ${pageMargin === m ? 'border-[#00AEEF] bg-[#00AEEF] text-black font-medium' : 'border-[var(--foreground)] border-opacity-10 bg-[var(--foreground)] bg-opacity-5 hover:border-[#00AEEF] hover:bg-[#00AEEF] hover:text-black'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>

          <button className="p-2 rounded-lg bg-fg-border-light hover:bg-[#00AEEF] hover:text-white transition-colors hidden sm:block">
            <Bookmark className="w-5 h-5 opacity-80" />
          </button>
          
          <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-fg-border-light hover:bg-[#00AEEF] hover:text-white transition-colors hidden md:block">
            {isFullscreen ? <Minimize className="w-5 h-5 opacity-80" /> : <Maximize className="w-5 h-5 opacity-80" />}
          </button>
          
          <button className="p-2 rounded-lg bg-fg-border-light hover:bg-[#00AEEF] hover:text-white transition-colors">
            <MoreVertical className="w-5 h-5 opacity-80" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Floating Left Arrow */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden sm:block">
          <button 
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(p => p - 1)}
            className="w-12 h-12 rounded-full border border-[var(--foreground)] border-opacity-20 flex items-center justify-center bg-[var(--background)] opacity-50 hover:opacity-100 disabled:opacity-10 transition-all hover:scale-105 shadow-xl"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Reader Area */}
        <main className={`flex-1 overflow-auto flex justify-center py-8 px-6 sm:px-20 ${fontFamily}`}>
          {/* Always mount Document to ensure it loads, but hide it when in text mode */}
          <div className={`w-full flex items-center justify-center h-full pdf-canvas-wrapper overflow-auto ${viewMode === 'text' ? 'hidden' : ''}`}>
             <Document
               file={file}
               onLoadSuccess={onDocumentLoadSuccess}
               loading={<div className="w-8 h-8 border-2 border-t-transparent border-current rounded-full animate-spin"></div>}
             >
               <div className="shadow-2xl ring-1 ring-[var(--foreground)] ring-opacity-5 bg-white">
                 <Page 
                   pageNumber={pageNumber} 
                   scale={scale} 
                   renderTextLayer={true}
                   renderAnnotationLayer={true}
                   loading={<div className="w-full h-full bg-white/5 animate-pulse" style={{ minHeight: '800px', minWidth: '600px' }} />}
                 />
               </div>
             </Document>
          </div>

          {/* Text Mode Display */}
          {viewMode === "text" && (
             <div className={`w-full ${marginMap[pageMargin]} mx-auto transition-all duration-300`}>
                {isExtracting ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-50 space-y-4 pt-32">
                    <div className="w-8 h-8 border-2 border-t-transparent border-current rounded-full animate-spin"></div>
                    <p className="text-sm font-sans tracking-wide">Reflowing text...</p>
                  </div>
                ) : (
                  <div className={`reader-text-content text-lg md:text-xl lg:text-2xl ${pageLayout === 'two' ? 'layout-two-columns' : ''}`}>
                    {extractedText ? (
                      extractedText.split('\n\n').map((paragraph, i) => (
                        <p key={i}>{paragraph}</p>
                      ))
                    ) : (
                      <p className="text-center opacity-50 italic pt-32">No text found on this page. Try switching to Original PDF mode.</p>
                    )}
                  </div>
                )}
             </div>
          )}
        </main>

        {/* Floating Right Arrow */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 hidden sm:block">
          <button 
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber(p => p + 1)}
            className="w-12 h-12 rounded-full border border-[var(--foreground)] border-opacity-20 flex items-center justify-center bg-[var(--background)] opacity-50 hover:opacity-100 disabled:opacity-10 transition-all hover:scale-105 shadow-xl"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* TOC Sidebar */}
        {isTocOpen && (
          <div ref={tocRef} className="w-80 border-l border-[var(--foreground)] border-opacity-10 bg-[var(--background)] flex flex-col z-50 shadow-2xl absolute right-0 top-0 h-full animate-in slide-in-from-right-8 duration-200">
            <div className="p-4 border-b border-[var(--foreground)] border-opacity-10 flex items-center justify-between">
              <h3 className="font-bold">Table of Contents</h3>
              <button onClick={() => setIsTocOpen(false)} className="p-1 opacity-50 hover:opacity-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-1">
                <p className="text-sm opacity-50 italic mb-4">Jump to page:</p>
                {Array.from(new Array(Math.min(numPages, 100)), (el, index) => (
                  <button
                    key={`page_${index + 1}`}
                    onClick={() => { setPageNumber(index + 1); setIsTocOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors ${pageNumber === index + 1 ? 'bg-[#00AEEF] text-white border-transparent font-medium' : 'hover:bg-[#00AEEF] hover:text-white border-transparent'}`}
                  >
                    Page {index + 1}
                  </button>
                ))}
                {numPages > 100 && <p className="text-xs opacity-50 p-2 text-center mt-2">More pages available via arrows</p>}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom Progress Bar */}
      <footer className="flex-shrink-0 flex flex-col px-4 md:px-8 py-3 bg-[var(--background)] border-t border-[var(--foreground)] border-opacity-5 z-20">
        
        {/* Progress Line */}
        <div className="w-full h-1 bg-[#00AEEF] text-white border-transparent rounded-full mb-3 relative group cursor-pointer">
          <div 
            className="absolute left-0 top-0 h-full bg-[#00AEEF] rounded-full transition-all duration-300"
            style={{ width: `${(pageNumber / (numPages || 1)) * 100}%` }}
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-[var(--foreground)] rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform"
            style={{ left: `calc(${(pageNumber / (numPages || 1)) * 100}% - 8px)` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs opacity-60 font-medium px-2">
          <div className="truncate">{readingSpeedText}</div>
          <div className="flex-shrink-0">
            Page {pageNumber} of {numPages || '--'} • {numPages ? Math.round((pageNumber / numPages) * 100) : 0}%
          </div>
        </div>

      </footer>
      
      {/* Mobile Swipe Navigation Areas */}
      <div className="sm:hidden absolute top-16 bottom-16 left-0 w-1/4 z-0" onClick={() => pageNumber > 1 && setPageNumber(p => p - 1)} />
      <div className="sm:hidden absolute top-16 bottom-16 right-0 w-1/4 z-0" onClick={() => pageNumber < numPages && setPageNumber(p => p + 1)} />

    </div>
  );
}
