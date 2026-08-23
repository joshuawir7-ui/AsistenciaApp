import re
import sys

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract Google block
google_regex = r"(?s)( *<!-- GROUP: CUENTA DE GOOGLE -->.*?</div>\s*</div>\s*</div>\n)"
match = re.search(google_regex, content)
if not match:
    print("Could not find Google block")
    sys.exit(1)

google_block = match.group(1)

# Remove from original place
content = content.replace(google_block, '')

# Change the button styling inside google_block
old_btn = r'<button type="button" class="google-login-btn-official" id="btn-google-signin" onclick="window\.toggleGoogleAccount\(\)">\s*<svg width="20" height="20" viewBox="0 0 24 24">.*?<span>Iniciar sesión con Google</span>\s*</button>'

new_btn = """<button type="button" class="google-login-btn-official" id="btn-google-signin" onclick="window.toggleGoogleAccount()" style="display: flex; align-items: center; justify-content: center; gap: 12px; background-color: #ffffff; color: #3c4043; border: 1px solid #dadce0; border-radius: 4px; padding: 0 16px; height: 42px; font-family: 'Google Sans', Roboto, sans-serif; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);" onmouseover="this.style.backgroundColor='#f8f9fa'; this.style.boxShadow='0 1px 3px 0 rgba(60,64,67,0.3), 0 4px 8px 3px rgba(60,64,67,0.15)';" onmouseout="this.style.backgroundColor='#ffffff'; this.style.boxShadow='0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)';">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                    </svg>
                    <span style="font-family: 'Google Sans', Roboto, arial, sans-serif;">Iniciar sesión con Google</span>
                  </button>"""
google_block, num_subs = re.subn(old_btn, new_btn, google_block, flags=re.DOTALL)
if num_subs == 0:
    print("Could not find the button to replace")
    sys.exit(1)

# Insert before GROUP 2
target_insert = "          <!-- GROUP 2: NOTIFICACIONES Y RECORDATORIOS -->"
if target_insert not in content:
    print("Could not find insertion target")
    sys.exit(1)
    
content = content.replace(target_insert, google_block + "\n" + target_insert)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully moved and styled Google block")
