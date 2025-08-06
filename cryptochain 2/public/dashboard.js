let currentWallet = null;

window.onload = () => {
  document.getElementById('onboardingModal').style.display = 'block';
};

async function signup() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.address) {
    currentWallet = data.address;
    closeModal();
  } else {
    alert(data.message);
  }
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.address) {
    currentWallet = data.address;
    closeModal();
  } else {
    alert(data.message);
  }
}

function generatePaperWallet() {
  fetch('/api/generate-wallet', { method: 'POST' })
    .then(res => res.json())
    .then(wallet => {
      document.getElementById('generatedAddress').innerText = wallet.address;
      document.getElementById('generatedPrivateKey').innerText = wallet.privateKey;
      currentWallet = wallet.address;
      document.getElementById('wallet-details').style.display = 'block';
      generateQR(wallet.address);
    });
}

function generateQR(address) {
  const canvas = document.createElement('canvas');
  QRCode.toCanvas(canvas, address, function (error) {
    if (error) console.error(error);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.getElementById('downloadQR');
      link.href = url;
      link.style.display = 'inline-block';
    });
  });
}

function proceed() {
  closeModal();
}

function closeModal() {
  document.getElementById('onboardingModal').style.display = 'none';
}
