// THROWAWAY — MK01 spike. Confined to /spike/markitdown/ (KRD §84: ratchet OFF, rigor T0).
// A standalone module so the probe never imports nor pollutes the real back/ module.
// Nothing here graduates: /harvest proposes, /goal freezes, the real code is rebuilt later (MK02+).
// stdlib-only on purpose: the probe must run OFFLINE and DETERMINISTICALLY; the real
// microsoft/markitdown adapter is an OpenQuestion wired behind the MK02 port, never here.
module aidos.spike/markitdown

go 1.22
