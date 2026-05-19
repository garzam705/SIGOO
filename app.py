# app.py — SIGOO Backend completo
# Autenticación por email/contraseña, JWT, SQLite
import os
import sqlite3
import jwt
import datetime
import re
from functools import wraps
from flask import Flask, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from flask_cors import CORS

app = Flask(__name__)
# Permitir CORS desde tu frontend en Netlify (ajusta si cambia la URL)
CORS(app, origins=["https://sigoo.netlify.app", "http://localhost:5500", "https://sigoo.onrender.com"])

# ═══════════════════════════════════════════════════════════════
# CONFIGURACIÓN
# ═══════════════════════════════════════════════════════════════
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'clave-super-segura-cambiar-en-produccion')
DATABASE = os.path.join(os.path.dirname(__file__), 'sigoo.db')

# ═══════════════════════════════════════════════════════════════
# BASE DE DATOS (helpers)
# ═══════════════════════════════════════════════════════════════
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """Crea las tablas si no existen y agrega un usuario administrador por defecto."""
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
            if not os.path.exists(schema_path):
                print("ERROR: No se encuentra el archivo schema.sql en", schema_path)
                return
            with open(schema_path, 'r') as f:
                db.cursor().executescript(f.read())
            db.commit()
            # Insertar admin por defecto
            try:
                db.execute(
                    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
                    ('admin@sigoo.com', generate_password_hash('admin123'), 'Administrador', 'admin')
                )
                db.commit()
                print("Usuario admin creado correctamente.")
            except sqlite3.IntegrityError:
                pass

# ═══════════════════════════════════════════════════════════════
# UTILIDADES
# ═══════════════════════════════════════════════════════════════
def validate_email(email):
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email))

def make_token(user):
    return jwt.encode({
        'user_id': user['id'],
        'role': user['role'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }, app.config['SECRET_KEY'], algorithm='HS256')

# ═══════════════════════════════════════════════════════════════
# DECORADORES
# ═══════════════════════════════════════════════════════════════
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Token requerido'}), 401
        try:
            tok = auth_header.split(' ')[1]
            data = jwt.decode(tok, app.config['SECRET_KEY'], algorithms=['HS256'])
            g.current_user_id = data['user_id']
            g.current_user_role = data['role']
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Sesión expirada, inicia sesión nuevamente'}), 401
        except Exception:
            return jsonify({'error': 'Token inválido'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if g.current_user_role != 'admin':
            return jsonify({'error': 'Se requiere rol de administrador'}), 403
        return f(*args, **kwargs)
    return decorated

# ═══════════════════════════════════════════════════════════════
# RUTAS PÚBLICAS
# ═══════════════════════════════════════════════════════════════
@app.route('/', methods=['GET'])
def home():
    return jsonify({'status': 'ok', 'message': 'Backend SIGOO funcionando correctamente'})

@app.route('/api/register', methods=['POST', 'OPTIONS'])
def register():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')
    name = data.get('name', '').strip()
    role = data.get('role', 'client')

    errors = {}
    if not name or len(name) < 2:
        errors['name'] = 'El nombre debe tener al menos 2 caracteres'
    if not validate_email(email):
        errors['email'] = 'Correo electrónico inválido'
    if len(password) < 6:
        errors['password'] = 'La contraseña debe tener al menos 6 caracteres'
    if role not in ('client', 'admin'):
        role = 'client'
    if errors:
        return jsonify({'error': 'Datos inválidos', 'fields': errors}), 400

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
            (email, generate_password_hash(password), name, role)
        )
        db.commit()
        return jsonify({'message': 'Usuario registrado exitosamente'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'El correo ya está registrado'}), 409

@app.route('/api/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Correo y contraseña requeridos'}), 400
    if not validate_email(email):
        return jsonify({'error': 'Correo electrónico inválido'}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Correo o contraseña incorrectos'}), 401

    token = make_token(user)
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
    })

# ═══════════════════════════════════════════════════════════════
# ÓRDENES (solo admin puede crear, pero clientes pueden ver sus órdenes)
# ═══════════════════════════════════════════════════════════════
@app.route('/api/orders', methods=['POST', 'OPTIONS'])
@token_required
@admin_required
def create_order():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json() or {}
    client_id = data.get('client_id')
    description = data.get('description', '').strip()
    estimated_cost = data.get('estimated_cost', 0)

    # Validaciones
    if not client_id or not isinstance(client_id, int) or client_id <= 0:
        return jsonify({'error': 'El ID del cliente es obligatorio y debe ser un número positivo'}), 400
    if not description or len(description) < 5:
        return jsonify({'error': 'La descripción debe tener al menos 5 caracteres'}), 400
    try:
        estimated_cost = float(estimated_cost)
        if estimated_cost < 0:
            return jsonify({'error': 'El costo estimado no puede ser negativo'}), 400
    except (TypeError, ValueError):
        estimated_cost = 0.0

    db = get_db()
    client = db.execute(
        "SELECT id FROM users WHERE id = ? AND role = 'client'", (client_id,)
    ).fetchone()
    if not client:
        return jsonify({'error': f'No se encontró un cliente con ID {client_id}'}), 404

    # Generar folio secuencial
    last = db.execute("SELECT folio FROM orders ORDER BY id DESC LIMIT 1").fetchone()
    if last:
        last_num = int(last['folio'].split('-')[1])
        folio = f"FOL-{last_num + 1:04d}"
    else:
        folio = "FOL-0001"

    db.execute(
        "INSERT INTO orders (folio, client_id, description, estimated_cost, status) VALUES (?, ?, ?, ?, 'Recibido')",
        (folio, client_id, description, estimated_cost)
    )
    db.commit()
    new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
    order = db.execute("SELECT * FROM orders WHERE id = ?", (new_id,)).fetchone()
    return jsonify(dict(order)), 201

@app.route('/api/orders', methods=['GET'])
@token_required
def get_orders():
    db = get_db()
    if g.current_user_role == 'admin':
        orders = db.execute("SELECT * FROM orders ORDER BY created_at DESC").fetchall()
    else:
        orders = db.execute(
            "SELECT * FROM orders WHERE client_id = ? ORDER BY created_at DESC",
            (g.current_user_id,)
        ).fetchall()
    return jsonify([dict(row) for row in orders])

@app.route('/api/orders/<int:order_id>', methods=['GET'])
@token_required
def get_order(order_id):
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        return jsonify({'error': 'Orden no encontrada'}), 404
    if g.current_user_role == 'client' and order['client_id'] != g.current_user_id:
        return jsonify({'error': 'Acceso no autorizado'}), 403
    return jsonify(dict(order))

# ═══════════════════════════════════════════════════════════════
# ACTUALIZACIÓN DE ESTADO (Kanban, solo admin)
# ═══════════════════════════════════════════════════════════════
ALLOWED_TRANSITIONS = {
    'Recibido': ['Diagnostico'],
    'Diagnostico': ['Reparado'],
    'Reparado': ['Entregado'],
    'Entregado': []
}

@app.route('/api/orders/<int:order_id>/status', methods=['PUT', 'OPTIONS'])
@token_required
@admin_required
def update_status(order_id):
    if request.method == 'OPTIONS':
        return '', 200
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        return jsonify({'error': 'Orden no encontrada'}), 404

    new_status = (request.get_json() or {}).get('status', '').strip()
    if not new_status:
        return jsonify({'error': 'El nuevo estado es requerido'}), 400

    allowed = ALLOWED_TRANSITIONS.get(order['status'], [])
    if new_status not in allowed:
        return jsonify({
            'error': f"Transición inválida: {order['status']} → {new_status}",
            'allowed': allowed
        }), 400

    db.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, order_id))
    db.commit()
    updated = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return jsonify(dict(updated))

# ═══════════════════════════════════════════════════════════════
# AUTORIZACIÓN DE PRESUPUESTO (cliente)
# ═══════════════════════════════════════════════════════════════
@app.route('/api/orders/<int:order_id>/authorize', methods=['PUT', 'OPTIONS'])
@token_required
def authorize_order(order_id):
    if request.method == 'OPTIONS':
        return '', 200
    if g.current_user_role != 'client':
        return jsonify({'error': 'Solo el cliente puede autorizar el presupuesto'}), 403
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order or order['client_id'] != g.current_user_id:
        return jsonify({'error': 'Orden no encontrada o no te pertenece'}), 404
    if order['authorized']:
        return jsonify({'error': 'Este presupuesto ya fue autorizado'}), 400
    if order['estimated_cost'] <= 0:
        return jsonify({'error': 'No hay un presupuesto que autorizar'}), 400

    db.execute("UPDATE orders SET authorized = 1 WHERE id = ?", (order_id,))
    db.commit()
    return jsonify({'message': 'Presupuesto autorizado correctamente'})

# ═══════════════════════════════════════════════════════════════
# INVENTARIO (solo admin)
# ═══════════════════════════════════════════════════════════════
@app.route('/api/inventory', methods=['GET'])
@token_required
@admin_required
def get_inventory():
    db = get_db()
    items = db.execute("SELECT * FROM inventory ORDER BY name").fetchall()
    return jsonify([dict(item) for item in items])

@app.route('/api/inventory', methods=['POST', 'OPTIONS'])
@token_required
@admin_required
def add_inventory_item():
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    quantity = data.get('quantity', 0)

    if not name or len(name) < 2:
        return jsonify({'error': 'El nombre del producto debe tener al menos 2 caracteres'}), 400
    if not isinstance(quantity, int) or quantity < 0:
        return jsonify({'error': 'La cantidad debe ser un número entero no negativo'}), 400

    db = get_db()
    try:
        db.execute("INSERT INTO inventory (name, quantity) VALUES (?, ?)", (name, quantity))
        db.commit()
        new_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        item = db.execute("SELECT * FROM inventory WHERE id = ?", (new_id,)).fetchone()
        return jsonify(dict(item)), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Ya existe un producto con ese nombre'}), 409

@app.route('/api/inventory/<int:item_id>', methods=['PUT', 'OPTIONS'])
@token_required
@admin_required
def update_inventory(item_id):
    if request.method == 'OPTIONS':
        return '', 200
    data = request.get_json() or {}
    new_qty = data.get('quantity')

    if not isinstance(new_qty, int) or new_qty < 0:
        return jsonify({'error': 'La cantidad debe ser un número entero no negativo'}), 400

    db = get_db()
    item = db.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    if not item:
        return jsonify({'error': 'Producto no encontrado'}), 404

    db.execute("UPDATE inventory SET quantity = ? WHERE id = ?", (new_qty, item_id))
    db.commit()
    updated = db.execute("SELECT * FROM inventory WHERE id = ?", (item_id,)).fetchone()
    return jsonify(dict(updated))

# ═══════════════════════════════════════════════════════════════
# INICIALIZAR BASE DE DATOS AL ARRANCAR
# ═══════════════════════════════════════════════════════════════
init_db()

if __name__ == '__main__':
    app.run(debug=False, port=5000)
    