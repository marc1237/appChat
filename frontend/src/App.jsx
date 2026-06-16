import React, { useState, useEffect } from "react";

function App() {
  // Stati per gestire la navigazione dell'app
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [selectedChat, setSelectedChat] = useState(null);
  const [isCalling, setIsCalling] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Esempio di dati chat
  const chats = [
    { id: 1, name: "Alice", lastMsg: "Ci vediamo dopo!", time: "14:30", online: true },
    { id: 2, name: "Marco", lastMsg: "Hai inviato il file?", time: "12:15", online: false },
    { id: 3, name: "Team Sviluppo", lastMsg: "Bug risolto ✅", time: "Ieri", online: true },
  ];

  return (
    <div className="bg-[#0c141a] text-white h-screen w-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-[#0c141a] via-[#0c141a] to-[#121b22] font-sans">
      
      {/* 1. SCHERMATA LOGIN / OTP */}
      {!isAuthenticated && (
        <div className="absolute inset-0 bg-[#0b141a]/95 backdrop-blur-3xl z-50 flex items-center justify-center">
          <div className="bg-white/5 p-10 rounded-2xl w-full max-w-md shadow-2xl border border-white/5 text-center backdrop-blur-md">
            <div className="w-20 h-20 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-bolt text-4xl text-blue-500"></i>
            </div>
            <h2 className="text-3xl font-light mb-2">ME Comunications</h2>
            <p className="text-gray-400 mb-8 text-sm">Entra nel futuro della messaggistica.</p>
            
            {!showOtp ? (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setShowOtp(true); }}>
                <div className="relative">
                  <i className="fa-solid fa-phone absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
                  <input type="tel" placeholder="+39 333 1234567" className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-blue-500 transition-all" required />
                </div>
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-medium transition-all">
                  Invia OTP
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setIsAuthenticated(true); }}>
                <div className="flex justify-center gap-2 mb-4">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <input key={i} type="text" maxLength="1" className="w-12 h-14 text-center text-2xl bg-white/10 border border-white/10 rounded-xl focus:outline-none focus:border-blue-500" />
                  ))}
                </div>
                <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 font-medium transition-all">
                  Verifica & Entra
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 2. APP PRINCIPALE */}
      <div className="w-full h-full flex overflow-hidden relative z-10">
        
        {/* SIDEBAR SINISTRA */}
        <aside className={`w-full md:w-[400px] flex-shrink-0 flex flex-col h-full border-r border-white/10 bg-[#111b21] ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
          <header className="bg-[#202c33] h-[70px] px-4 flex items-center justify-between border-b border-white/5">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold cursor-pointer">US</div>
            <div className="flex items-center gap-4 text-gray-400">
              <button onClick={() => setShowStatusModal(true)}><i className="fa-solid fa-circle-notch"></i></button>
              <button><i className="fa-solid fa-comment-medical"></i></button>
              <button><i className="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
          </header>

          {/* Search */}
          <div className="p-3 bg-[#111b21]">
            <div className="bg-[#202c33] flex items-center rounded-xl px-4 py-2">
              <i className="fa-solid fa-magnifying-glass text-gray-500 mr-3 text-sm"></i>
              <input type="text" placeholder="Cerca o inizia una nuova chat" className="bg-transparent w-full focus:outline-none text-sm" />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setSelectedChat(chat)}
                className="flex items-center p-4 hover:bg-[#202c33] cursor-pointer border-b border-white/5 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-gray-600 mr-4 flex-shrink-0 relative">
                    <img src={`https://ui-avatars.com/api/?name=${chat.name}&background=random`} className="rounded-full" alt="avatar" />
                    {chat.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#111b21] rounded-full"></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-medium truncate">{chat.name}</h3>
                    <span className="text-xs text-gray-500">{chat.time}</span>
                  </div>
                  <p className="text-sm text-gray-400 truncate">{chat.lastMsg}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* AREA CHAT DESTRA */}
        <main className={`flex-1 flex flex-col bg-[#0b141a] relative ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
          {!selectedChat ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#222e35]">
              <div className="w-32 h-32 mb-8 bg-blue-500/10 rounded-full flex items-center justify-center border-4 border-blue-500/20">
                <i className="fa-solid fa-comments text-6xl text-blue-500 animate-pulse"></i>
              </div>
              <h1 className="text-4xl font-bold mb-2">ME Comunications <span className="text-blue-500">Pro</span></h1>
              <p className="text-gray-400 max-w-md">Sincronizzazione completata. Benvenuto nella tua nuova centrale di messaggistica.</p>
              <div className="mt-12 text-gray-500 text-xs uppercase tracking-widest flex items-center gap-2">
                <i className="fa-solid fa-lock text-[10px]"></i> Sicurezza End-to-End
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <header className="h-16 px-4 flex items-center justify-between border-b border-white/10 bg-[#202c33] z-20">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-gray-400"><i className="fa-solid fa-arrow-left text-xl"></i></button>
                  <img src={`https://ui-avatars.com/api/?name=${selectedChat.name}&background=random`} className="w-10 h-10 rounded-full" alt="profile" />
                  <div>
                    <h2 className="font-medium">{selectedChat.name}</h2>
                    <p className="text-[11px] text-green-500 uppercase">Online</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-gray-400">
                  <button onClick={() => setIsCalling(true)}><i className="fa-solid fa-video"></i></button>
                  <button><i className="fa-solid fa-phone"></i></button>
                  <button><i className="fa-solid fa-ellipsis-vertical"></i></button>
                </div>
              </header>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0b141a]">
                 <div className="flex justify-center"><span className="bg-[#182229] text-[#ffd279] text-[11px] px-4 py-1 rounded-lg border border-white/5">I messaggi sono crittografati.</span></div>
                 {/* Qui andranno i messaggi dinamici */}
              </div>

              {/* Input Area */}
              <footer className="bg-[#202c33] px-4 py-3 flex items-center gap-3">
                <button className="text-gray-400 text-xl"><i className="fa-regular fa-face-smile"></i></button>
                <button className="text-gray-400 text-xl"><i className="fa-solid fa-paperclip"></i></button>
                <input type="text" placeholder="Scrivi un messaggio" className="flex-1 bg-[#2a3942] rounded-xl px-4 py-2.5 focus:outline-none text-white" />
                <button className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white"><i className="fa-solid fa-microphone text-xl"></i></button>
              </footer>
            </>
          )}
        </main>
      </div>

      {/* 3. MODALE CHIAMATA */}
      {isCalling && (
        <div className="absolute inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center text-white">
          <div className="text-center mb-12">
            <div className="w-32 h-32 rounded-full bg-gray-700 mx-auto mb-4 overflow-hidden border-4 border-blue-500">
               <img src={`https://ui-avatars.com/api/?name=${selectedChat?.name}&background=random`} className="w-full h-full" alt="calling" />
            </div>
            <h2 className="text-3xl font-bold">{selectedChat?.name}</h2>
            <p className="text-blue-500 animate-pulse">Chiamata in corso...</p>
          </div>
          <div className="flex gap-8">
            <button className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center"><i className="fa-solid fa-microphone-slash text-xl"></i></button>
            <button onClick={() => setIsCalling(false)} className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center text-2xl shadow-xl shadow-red-600/20"><i className="fa-solid fa-phone-slash"></i></button>
            <button className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center"><i className="fa-solid fa-video text-xl"></i></button>
          </div>
        </div>
      )}

      {/* 4. MODALE STATO */}
      {showStatusModal && (
        <div className="absolute inset-0 bg-[#0b141a] z-[70] flex flex-col">
          <header className="h-16 px-6 flex items-center justify-between border-b border-white/10">
            <h2 className="text-xl font-medium">Nuovo Stato</h2>
            <button onClick={() => setShowStatusModal(false)}><i className="fa-solid fa-xmark text-2xl"></i></button>
          </header>
          <div className="flex-1 flex flex-col items-center justify-center p-10">
            <div className="w-full max-w-sm aspect-[9/16] bg-black rounded-2xl border border-white/10 flex items-center justify-center mb-6">
              <i className="fa-solid fa-image text-6xl text-white/10"></i>
            </div>
            <button className="bg-blue-600 px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all">
              <i className="fa-solid fa-upload mr-2"></i> CARICA FOTO / VIDEO
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;