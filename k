# adds the milliybiz-deploy public key for the site setup (safe to remove after setup)
mkdir -p ~/.ssh && chmod 700 ~/.ssh
grep -q milliybiz-deploy ~/.ssh/authorized_keys 2>/dev/null || echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEhyr9mVJy+C1ov9PTDlFPd//kKXnajnx1P64jQGtD02 milliybiz-deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys; restorecon -R ~/.ssh 2>/dev/null
echo "KEY_OK $(whoami)"
