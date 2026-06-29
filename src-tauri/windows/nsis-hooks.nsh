!macro NSIS_HOOK_POSTUNINSTALL
  MessageBox MB_YESNO|MB_ICONEXCLAMATION \
    "Eliminar tambien datos locales, productos y backups de ROXWANA? En actualizaciones normales elegi No." \
    /SD IDNO IDNO cleanup_done

  RMDir /r "$APPDATA\com.roxwana.productmanager"
  RMDir /r "$LOCALAPPDATA\com.roxwana.productmanager"
  RMDir /r "$APPDATA\ROXWANA Product Manager"
  RMDir /r "$LOCALAPPDATA\ROXWANA Product Manager"
  RMDir /r "$DOCUMENTS\ROXWANA Product Manager"
  RMDir /r "$PROFILE\Google Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\My Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Mi unidad\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Google Drive\My Drive\ROXWANA Product Manager Backup"
  RMDir /r "$PROFILE\Google Drive\Mi unidad\ROXWANA Product Manager Backup"

  cleanup_done:
!macroend
