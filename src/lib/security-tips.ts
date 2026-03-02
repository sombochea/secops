export interface SecurityTip {
  id: string;
  category: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  /** Why this matters */
  impact: string;
  /** Step-by-step remediation */
  steps: string[];
  /** Commands the user can try in the playground */
  commands?: { label: string; command: string; description: string }[];
  /** External references */
  references?: { title: string; url: string }[];
  tags: string[];
}

// ─── Add new tips here. The UI picks them up automatically. ───────────────────

export const SECURITY_TIPS: SecurityTip[] = [
  {
    id: "ssh-hardening",
    category: "SSH Hardening",
    title: "Disable root login and password authentication",
    severity: "critical",
    description:
      "Root login over SSH is the #1 target for brute-force attacks. Disabling it forces attackers to guess both a username and a key, dramatically reducing the attack surface.",
    impact:
      "An exposed root SSH login allows attackers to gain full system control with a single credential. Combined with password auth, it makes brute-force attacks trivial.",
    steps: [
      "Edit /etc/ssh/sshd_config",
      "Set PermitRootLogin no",
      "Set PasswordAuthentication no",
      "Set PubkeyAuthentication yes",
      "Restart sshd: sudo systemctl restart sshd",
      "Verify: ssh root@your-server should be rejected",
    ],
    commands: [
      {
        label: "Check current config",
        command: "sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'",
        description: "Shows the effective SSH daemon configuration for key auth settings.",
      },
      {
        label: "Test SSH config",
        command: "sudo sshd -t",
        description: "Validates sshd_config syntax before restarting. Returns nothing if valid.",
      },
      {
        label: "Restart SSH",
        command: "sudo systemctl restart sshd",
        description: "Applies the new configuration. Make sure you have key-based access first!",
      },
    ],
    references: [
      { title: "OpenSSH Manual — sshd_config", url: "https://man.openbsd.org/sshd_config" },
    ],
    tags: ["ssh", "brute-force", "authentication", "root"],
  },
  {
    id: "fail2ban-setup",
    category: "Intrusion Prevention",
    title: "Install and configure fail2ban for SSH",
    severity: "critical",
    description:
      "fail2ban monitors log files and bans IPs that show malicious signs — too many password failures, seeking exploits, etc. It's the first line of automated defense.",
    impact:
      "Without fail2ban, a single attacker can attempt thousands of passwords per minute. fail2ban automatically blocks them after a configurable number of failures.",
    steps: [
      "Install: sudo apt install fail2ban (Debian/Ubuntu) or sudo yum install fail2ban (RHEL)",
      "Copy default config: sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local",
      "Edit jail.local: set bantime = 1h, findtime = 10m, maxretry = 3",
      "Enable SSH jail: set enabled = true under [sshd]",
      "Start: sudo systemctl enable --now fail2ban",
      "Verify: sudo fail2ban-client status sshd",
    ],
    commands: [
      {
        label: "Check fail2ban status",
        command: "sudo fail2ban-client status sshd",
        description: "Shows currently banned IPs and filter stats for the SSH jail.",
      },
      {
        label: "Ban an IP manually",
        command: "sudo fail2ban-client set sshd banip 203.0.113.42",
        description: "Immediately bans the specified IP in the sshd jail.",
      },
      {
        label: "Unban an IP",
        command: "sudo fail2ban-client set sshd unbanip 203.0.113.42",
        description: "Removes the ban for the specified IP.",
      },
      {
        label: "View fail2ban log",
        command: "sudo tail -50 /var/log/fail2ban.log",
        description: "Shows recent fail2ban activity including bans and unbans.",
      },
    ],
    references: [
      { title: "fail2ban Documentation", url: "https://www.fail2ban.org/wiki/index.php/Main_Page" },
    ],
    tags: ["fail2ban", "brute-force", "ips", "automation"],
  },
  {
    id: "firewall-rules",
    category: "Network Security",
    title: "Configure firewall to restrict attack surface",
    severity: "high",
    description:
      "A properly configured firewall ensures only necessary ports are exposed. Every open port is a potential entry point for attackers.",
    impact:
      "Open ports expose services to the internet. Attackers scan for open ports and exploit vulnerable services. Minimizing exposure reduces the attack surface significantly.",
    steps: [
      "Audit open ports: sudo ss -tlnp",
      "Define allowed ports (e.g., 22, 80, 443)",
      "Set default policy to DROP: sudo iptables -P INPUT DROP",
      "Allow established connections: sudo iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
      "Allow loopback: sudo iptables -A INPUT -i lo -j ACCEPT",
      "Allow specific ports: sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT",
      "Save rules: sudo iptables-save > /etc/iptables/rules.v4",
    ],
    commands: [
      {
        label: "List open ports",
        command: "sudo ss -tlnp",
        description: "Shows all TCP ports currently listening with their associated processes.",
      },
      {
        label: "View current iptables rules",
        command: "sudo iptables -L -n -v --line-numbers",
        description: "Displays all firewall rules with packet counters and line numbers.",
      },
      {
        label: "Block a specific IP",
        command: "sudo iptables -A INPUT -s 203.0.113.42 -j DROP",
        description: "Drops all incoming traffic from the specified IP address.",
      },
      {
        label: "Allow SSH only from trusted network",
        command: "sudo iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 22 -j ACCEPT",
        description: "Restricts SSH access to your internal network only.",
      },
    ],
    references: [
      { title: "iptables Tutorial", url: "https://www.netfilter.org/documentation/" },
    ],
    tags: ["firewall", "iptables", "ports", "network"],
  },
  {
    id: "ssh-port-change",
    category: "SSH Hardening",
    title: "Change default SSH port",
    severity: "medium",
    description:
      "Moving SSH off port 22 eliminates the vast majority of automated scanning bots. It's security through obscurity but significantly reduces noise.",
    impact:
      "Most automated attacks target port 22 exclusively. Changing the port won't stop a determined attacker but eliminates 99% of bot traffic.",
    steps: [
      "Choose a high port (e.g., 2222 or 22222)",
      "Edit /etc/ssh/sshd_config: set Port 2222",
      "Update firewall to allow the new port",
      "Restart sshd: sudo systemctl restart sshd",
      "Test connection on new port before closing old one",
      "Update fail2ban config to monitor the new port",
    ],
    commands: [
      {
        label: "Check current SSH port",
        command: "sudo sshd -T | grep port",
        description: "Shows which port(s) the SSH daemon is configured to listen on.",
      },
      {
        label: "Allow new port in firewall",
        command: "sudo iptables -A INPUT -p tcp --dport 2222 -j ACCEPT",
        description: "Opens the new SSH port in iptables before switching.",
      },
    ],
    tags: ["ssh", "port", "scanning", "bots"],
  },
  {
    id: "log-monitoring",
    category: "Monitoring",
    title: "Set up centralized log monitoring",
    severity: "high",
    description:
      "Centralized logging ensures you can detect and investigate incidents even if an attacker compromises a single server and clears local logs.",
    impact:
      "Without centralized logging, attackers can cover their tracks by deleting local logs. You lose visibility into what happened and when.",
    steps: [
      "Forward auth logs to your SecOps webhook endpoint",
      "Set up PAM logging for all authentication events",
      "Configure sshd to log at VERBOSE level",
      "Monitor /var/log/auth.log and /var/log/secure",
      "Set up alerts for failed login spikes",
    ],
    commands: [
      {
        label: "View recent auth failures",
        command: "sudo grep 'Failed password' /var/log/auth.log | tail -20",
        description: "Shows the 20 most recent failed password attempts.",
      },
      {
        label: "Count failures by IP",
        command: "sudo grep 'Failed password' /var/log/auth.log | grep -oP '\\d+\\.\\d+\\.\\d+\\.\\d+' | sort | uniq -c | sort -rn | head -10",
        description: "Ranks source IPs by number of failed login attempts.",
      },
      {
        label: "Send test event to SecOps",
        command: `curl -X POST http://localhost:3000/api/webhook \\
  -H "Content-Type: application/json" \\
  -H "x-webhook-secret: your-secret" \\
  -d '{"event":"ssh_attempt","status":"failed","auth_method":"password","host":"test-server","user":"root","source_ip":"203.0.113.42","service":"sshd","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%S+00:00)'"}'`,
        description: "Sends a test security event to your SecOps Center webhook.",
      },
    ],
    tags: ["logging", "monitoring", "pam", "syslog"],
  },
  {
    id: "key-management",
    category: "Authentication",
    title: "Use Ed25519 SSH keys with passphrases",
    severity: "high",
    description:
      "Ed25519 keys are shorter, faster, and more secure than RSA. Adding a passphrase protects the key if the private key file is compromised.",
    impact:
      "Weak or unprotected SSH keys are equivalent to writing your password on a sticky note. A stolen key without a passphrase gives instant access.",
    steps: [
      "Generate key: ssh-keygen -t ed25519 -C 'your-email'",
      "Set a strong passphrase when prompted",
      "Copy to server: ssh-copy-id -i ~/.ssh/id_ed25519.pub user@server",
      "Verify key-only login works",
      "Disable password auth in sshd_config",
      "Use ssh-agent to avoid retyping passphrase: eval $(ssh-agent) && ssh-add",
    ],
    commands: [
      {
        label: "Generate Ed25519 key",
        command: "ssh-keygen -t ed25519 -C 'secops-admin'",
        description: "Creates a new Ed25519 SSH key pair. You'll be prompted for a passphrase.",
      },
      {
        label: "List authorized keys on server",
        command: "cat ~/.ssh/authorized_keys",
        description: "Shows all public keys authorized to log in as the current user.",
      },
      {
        label: "Check key fingerprint",
        command: "ssh-keygen -lf ~/.ssh/id_ed25519.pub",
        description: "Displays the fingerprint of your public key for verification.",
      },
    ],
    tags: ["ssh", "keys", "ed25519", "authentication"],
  },
  {
    id: "auto-updates",
    category: "System Maintenance",
    title: "Enable automatic security updates",
    severity: "medium",
    description:
      "Unpatched systems are the easiest targets. Automatic security updates ensure critical patches are applied without waiting for manual intervention.",
    impact:
      "Known vulnerabilities are actively exploited within hours of disclosure. Delayed patching leaves a window for attackers to compromise your systems.",
    steps: [
      "Install unattended-upgrades: sudo apt install unattended-upgrades",
      "Enable: sudo dpkg-reconfigure -plow unattended-upgrades",
      "Configure /etc/apt/apt.conf.d/50unattended-upgrades",
      "Enable security updates origin pattern",
      "Optionally enable automatic reboot for kernel updates",
      "Check logs: /var/log/unattended-upgrades/",
    ],
    commands: [
      {
        label: "Check for pending updates",
        command: "sudo apt list --upgradable 2>/dev/null | head -20",
        description: "Lists packages with available updates.",
      },
      {
        label: "View unattended-upgrades log",
        command: "sudo cat /var/log/unattended-upgrades/unattended-upgrades.log | tail -30",
        description: "Shows recent automatic update activity.",
      },
    ],
    tags: ["updates", "patching", "maintenance"],
  },
];

export const CATEGORIES = [...new Set(SECURITY_TIPS.map((t) => t.category))];
export const ALL_TAGS = [...new Set(SECURITY_TIPS.flatMap((t) => t.tags))].sort();
