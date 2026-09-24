'''Work desk: thick honey top, charcoal sled frames, cable tray and a dropped cable.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.desk('d_'), 'desk')
export()
