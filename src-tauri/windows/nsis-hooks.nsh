!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$APPDATA\com.roxwana.productmanager"
  RMDir /r "$LOCALAPPDATA\com.roxwana.productmanager"
  RMDir /r "$APPDATA\ROXWANA Product Manager"
  RMDir /r "$LOCALAPPDATA\ROXWANA Product Manager"

  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Eliminar tambien productos locales y backups de ROXWANA? Esto borra carpetas de trabajo y copias sincronizadas con Google Drive." \
    /SD IDYES IDNO cleanup_done

  RMDir /r "$DOCUMENTS\ROXWANA Product Manager"
  RMDir /r "$PROFILE\Google Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\My Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Mi unidad\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Google Drive\My Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Google Drive\Mi unidad\ROXWANA Product Manager Backup"

  cleanup_done:
!macroend
