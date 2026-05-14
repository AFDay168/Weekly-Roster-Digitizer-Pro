
import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  Plus, 
  Trash2, 
  Download, 
  Loader2, 
  FileSpreadsheet, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Calendar,
  FileText,
  FileSearch,
  Zap,
  History,
  Moon,
  Sun
} from 'lucide-react';
import { StaffMember, RosterEntry } from './types';
import { processRosterImages } from './services/geminiService';
import { exportToExcel } from './utils/excelExport';
import { exportToPdf, exportToPdfTable } from './utils/pdfExport';

// Declare XLSX as any since it's loaded via script tag in index.html
declare const XLSX: any;

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [rosterImages, setRosterImages] = useState<string[]>([]);
  const [rosterEntries, setRosterEntries] = useState<RosterEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync theme with body for background colors
  useEffect(() => {
    if (isDarkMode) {
      document.body.className = "bg-slate-950 text-slate-100 transition-colors duration-300";
    } else {
      document.body.className = "bg-slate-50 text-slate-900 transition-colors duration-300";
    }
  }, [isDarkMode]);

  const excelDateToStr = (val: any): string => {
    if (typeof val === 'number') {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}/${m}/${d}`;
    }
    return String(val || "");
  };

  const excelTimeToStr = (val: any): string => {
    if (typeof val === 'number') {
      const totalSeconds = Math.round(val * 86400);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return String(val || "");
  };

  const getNextMonday = () => {
    const today = new Date();
    const day = today.getDay();
    const diff = (day === 0 ? 1 : 8 - day);
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + diff);
    return nextMonday.toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState(getNextMonday());

  const handleStaffUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const members: StaffMember[] = jsonData.slice(1)
          .filter(row => row && row[0])
          .map(row => {
            const fullName = String(row[0]).trim();
            const parts = fullName.split(/\s+/);
            const displayName = parts.slice(0, 2).join(' ');
            return { fullName, displayName };
          });

        if (members.length === 0) {
          setError("No staff names found in the uploaded file.");
          return;
        }
        setStaffList(members);
        setError(null);
      } catch (err) {
        setError("Failed to parse Staff List.");
      }
    };
    reader.readAsBinaryString(file as Blob);
  };

  const handleImagesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setRosterImages(prev => [...prev, event.target?.result as string]);
        }
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);
        
        const importedEntries: RosterEntry[] = jsonData.map((row: any) => {
          const dateStr = excelDateToStr(row.Date);
          const rawIn = excelTimeToStr(row["RAW In"]);
          const rawOut = excelTimeToStr(row["RAW Out"]);
          const name = String(row.Name || "");
          
          return {
            id: Math.random().toString(36).substr(2, 9),
            date: dateStr,
            rawIn: rawIn,
            rawOut: rawOut,
            name: name,
            // IGNORE Excel's Combine column - always regenerate from rawIn/rawOut/name
            combine: `${rawIn}-${rawOut} ${name}`
          };
        }).filter(e => e.date && e.name);

        setRosterEntries(importedEntries);
        if (importedEntries[0]?.date) setStartDate(importedEntries[0].date.replace(/\//g, '-'));
        setError(null);
      } catch (err) {
        setError("Failed to import Updated Roster.");
      }
    };
    reader.readAsBinaryString(file as Blob);
  };

  const startDigitization = async () => {
    if (staffList.length === 0 || rosterImages.length === 0) {
      setError("Staff list and photos are required.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const formattedStartDate = startDate.replace(/-/g, '/');
      const result = await processRosterImages(rosterImages, staffList, formattedStartDate);
      const mappedEntries: RosterEntry[] = result.entries.map((item) => ({
        id: Math.random().toString(36).substr(2, 9),
        date: item.date,
        rawIn: item.rawIn,
        rawOut: item.rawOut,
        name: item.name,
        combine: `${item.rawIn}-${item.rawOut} ${item.name}`
      }));
      setRosterEntries(mappedEntries);
    } catch (err: any) {
      setError("OCR process failed. Please check your photos.");
    } finally {
      setIsProcessing(false);
    }
  };

  const updateEntry = (id: string, field: keyof RosterEntry, value: string) => {
    setRosterEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        const updated = { ...entry, [field]: value };
        if (['rawIn', 'rawOut', 'name'].includes(field)) {
          updated.combine = `${updated.rawIn}-${updated.rawOut} ${updated.name}`;
        }
        return updated;
      }
      return entry;
    }));
  };

  const deleteRow = (id: string) => setRosterEntries(prev => prev.filter(e => e.id !== id));
  const addRow = () => {
    const newEntry: RosterEntry = {
      id: Math.random().toString(36).substr(2, 9),
      date: rosterEntries.length > 0 ? rosterEntries[rosterEntries.length - 1].date : startDate.replace(/-/g, '/'),
      rawIn: "09:00", rawOut: "18:00", name: "", combine: ""
    };
    setRosterEntries(prev => [...prev, newEntry]);
  };

  const containerClass = isDarkMode ? "dark bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900";
  const cardClass = isDarkMode ? "bg-slate-900 border-slate-800 shadow-xl" : "bg-white border-slate-200 shadow-sm";
  const inputClass = isDarkMode 
    ? "bg-slate-800 border-slate-700 text-slate-100 focus:ring-indigo-500" 
    : "bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-400";

  return (
    <div className={`min-h-screen transition-colors duration-300 ${containerClass}`}>
      <div className="max-w-7xl mx-auto px-4 py-8 pb-40">
        
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800/50 pb-8">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${isDarkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-600 text-white'}`}>
              <FileSpreadsheet size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Roster Digitizer Pro</h1>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>Handwriting-to-Digital Roster Engine</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-3 rounded-xl border transition-all ${isDarkMode ? 'bg-slate-900 border-slate-700 text-yellow-400' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {rosterEntries.length > 0 && (
              <div className="flex bg-indigo-600 rounded-xl p-1 shadow-lg shadow-indigo-500/20">
                <button onClick={() => exportToPdf(rosterEntries, startDate)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 rounded-lg"><Calendar size={18} /> Calendar</button>
                <button onClick={() => exportToPdfTable(rosterEntries)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 rounded-lg border-l border-white/10"><FileText size={18} /> List</button>
                <button onClick={() => exportToExcel(rosterEntries)} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white hover:bg-white/10 rounded-lg border-l border-white/10"><Download size={18} /> Excel</button>
              </div>
            )}
          </div>
        </header>

        <div className="space-y-10">
          
          {/* Section 1: Regular Workflow */}
          <section className={`rounded-[2.5rem] border overflow-hidden ${cardClass}`}>
            <div className={`px-8 py-6 border-b flex items-center gap-3 ${isDarkMode ? 'bg-indigo-500/5 border-slate-800' : 'bg-indigo-50 border-indigo-100'}`}>
              <Zap className="text-indigo-500" size={24} />
              <h2 className="text-xl font-black">1. New Roster Digitization</h2>
              <span className="ml-auto text-[10px] font-black uppercase tracking-widest opacity-50">Standard Workflow</span>
            </div>
            
            <div className="p-8 space-y-10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* 0. Start Date */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px]">0</span>
                    Start Date (Monday)
                  </label>
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className={`w-full px-5 py-4 rounded-2xl border font-bold text-lg focus:outline-none focus:ring-2 transition-all ${inputClass}`}
                  />
                </div>

                {/* 1. Staff List */}
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px]">1</span>
                    Staff List Upload
                  </label>
                  <div className="relative group h-[68px]">
                    <input type="file" accept=".csv, .xlsx, .xls" onChange={handleStaffUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                    <div className={`h-full border-2 border-dashed rounded-2xl flex items-center justify-center px-6 gap-3 transition-all ${staffList.length > 0 ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800/50 group-hover:border-indigo-500 text-slate-500'}`}>
                      {staffList.length > 0 ? <><CheckCircle2 size={22} /><span className="font-bold">{staffList.length} Staff Loaded</span></> : <><Upload size={22} /><span className="font-bold">Upload Staff List</span></>}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Roster Photos */}
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px]">2</span>
                  Roster Photos
                </label>
                <div className="relative group h-44">
                  <input type="file" multiple accept="image/*" onChange={handleImagesUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <div className={`h-full border-2 border-dashed rounded-3xl flex flex-col items-center justify-center gap-4 transition-all ${rosterImages.length > 0 ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400' : 'border-slate-700 bg-slate-800/50 group-hover:border-indigo-500 text-slate-500'}`}>
                    {rosterImages.length > 0 ? <><CheckCircle2 size={40} /><span className="font-black text-xl">{rosterImages.length} Photos Prepared</span></> : <><ImageIcon size={40} /><span className="font-bold">Click or drag handwriting photos</span></>}
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <button 
                  onClick={startDigitization}
                  disabled={isProcessing || staffList.length === 0 || rosterImages.length === 0}
                  className="bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-600 hover:bg-indigo-500 text-white px-20 py-5 rounded-[2rem] font-black text-xl shadow-2xl shadow-indigo-500/20 transition-all flex items-center gap-4 active:scale-95"
                >
                  {isProcessing ? <><Loader2 className="animate-spin" size={28} /> Processing...</> : <><Zap size={28} /> Digitize Now</>}
                </button>
              </div>
            </div>
          </section>

          {/* Section 2: Correction Workflow */}
          <section className={`rounded-[2.5rem] border border-dashed transition-all ${isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-100/50 border-slate-300'}`}>
            <div className="p-6 border-b border-dashed flex items-center gap-4 border-slate-800/30">
              <History className="text-slate-500" size={22} />
              <h2 className="text-lg font-bold text-slate-400">2. Import Updated Roster</h2>
              <div className="ml-auto bg-indigo-500/10 text-indigo-400 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest border border-indigo-500/20">Correction Mode</div>
            </div>
            <div className="p-8">
              <div className={`p-6 rounded-3xl border flex flex-col md:flex-row items-center gap-8 ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-white border-slate-200'}`}>
                <div className="flex-1 space-y-2">
                  <h4 className="font-black text-lg">Load Existing Excel Export</h4>
                  <p className="text-sm text-slate-500 leading-relaxed italic opacity-70">"Correction Mode recalculates Display strings based on RAW times to fix discrepancies."</p>
                </div>
                <div className="relative shrink-0 w-full md:w-auto">
                  <input type="file" accept=".xlsx" onChange={handleExcelImport} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                  <button className="w-full bg-slate-100 text-slate-900 px-8 py-4 rounded-2xl font-black text-sm shadow-lg hover:bg-white transition-all flex items-center justify-center gap-2 pointer-events-none">
                    <FileSearch size={20} /> Select File
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {error && (
          <div className="mt-10 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4 text-red-400 animate-in fade-in slide-in-from-top-4">
            <AlertCircle size={24} />
            <p className="font-bold text-sm">{error}</p>
          </div>
        )}

        {/* Results Table */}
        {rosterEntries.length > 0 && (
          <div className={`mt-20 rounded-[2.5rem] border overflow-hidden animate-in fade-in slide-in-from-bottom-10 ${cardClass}`}>
            <div className={`p-8 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div>
                <h3 className="font-black text-2xl tracking-tight">Verification Workspace</h3>
                <p className="text-sm text-slate-500 mt-1">Manual edits to RAW columns sync the Combine column automatically.</p>
              </div>
              <button onClick={addRow} className={`px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 transition-all border-2 shadow-sm ${isDarkMode ? 'bg-slate-800 border-indigo-500/20 text-indigo-400' : 'bg-white border-indigo-100 text-indigo-600'}`}>
                <Plus size={18} /> Add New Entry
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDarkMode ? 'bg-slate-950 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                    <th className="px-8 py-5 w-16">#</th>
                    <th className="px-8 py-5">Combine (Display Only)</th>
                    <th className="px-8 py-5">Date</th>
                    <th className="px-8 py-5">RAW In</th>
                    <th className="px-8 py-5">RAW Out</th>
                    <th className="px-8 py-5">Staff Name</th>
                    <th className="px-8 py-5 w-16 text-center">Del</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {rosterEntries.map((entry, index) => (
                    <tr key={entry.id} className={`transition-colors group ${isDarkMode ? 'hover:bg-indigo-500/5' : 'hover:bg-indigo-50/50'}`}>
                      <td className="px-8 py-4 text-sm font-bold opacity-30">{index + 1}</td>
                      <td className="px-8 py-4"><input type="text" value={entry.combine} onChange={(e) => updateEntry(entry.id, 'combine', e.target.value)} className="w-full bg-transparent border-none text-sm font-black focus:ring-0" /></td>
                      <td className="px-8 py-4"><input type="text" value={entry.date} onChange={(e) => updateEntry(entry.id, 'date', e.target.value)} className="w-full bg-transparent border-none text-sm focus:ring-0 opacity-60" /></td>
                      <td className="px-8 py-4"><input type="text" value={entry.rawIn} onChange={(e) => updateEntry(entry.id, 'rawIn', e.target.value)} className="w-full bg-transparent border-none text-sm focus:ring-0" /></td>
                      <td className="px-8 py-4"><input type="text" value={entry.rawOut} onChange={(e) => updateEntry(entry.id, 'rawOut', e.target.value)} className="w-full bg-transparent border-none text-sm focus:ring-0" /></td>
                      <td className="px-8 py-4"><input type="text" value={entry.name} onChange={(e) => updateEntry(entry.id, 'name', e.target.value)} className="w-full bg-transparent border-none text-sm font-black focus:ring-0" /></td>
                      <td className="px-8 py-4 text-center"><button onClick={() => deleteRow(entry.id)} className="text-red-500/50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Sticky Action Bar */}
        {rosterEntries.length > 0 && !isProcessing && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-2xl px-8 py-5 rounded-[2.5rem] shadow-2xl border border-white/10 flex items-center gap-8 animate-in slide-in-from-bottom-12 z-50">
            <div className="flex flex-col pr-8 border-r border-white/10">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1.5">Processed</span>
              <span className="text-xl font-black text-white">{rosterEntries.length} Items</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => exportToPdf(rosterEntries, startDate)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 transition-all text-sm active:scale-90"><Calendar size={20} /> Calendar PDF</button>
              <button onClick={() => exportToPdfTable(rosterEntries)} className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 transition-all text-sm active:scale-90"><FileText size={20} /> List PDF</button>
              <button onClick={() => exportToExcel(rosterEntries)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 transition-all text-sm active:scale-90"><Download size={20} /> Excel Export</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
